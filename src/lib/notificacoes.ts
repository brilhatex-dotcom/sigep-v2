import { prisma } from "@/lib/prisma";
import { permutasParaOSino } from "@/lib/permutaPedidos";
import { podeComoEncargo, podeVerP1 } from "@/lib/encargos";
import { garantirChatSilencioso } from "@/lib/chatDb";
import { envolvemEfetivo, lerPecunia, refAssinatura, TIPO_ASSINATURA, faltaBanco } from "@/lib/requerimentoPecunia";
import { refsAssinadas } from "@/lib/assinaturaSigep";
import { periodoAtivo } from "@/lib/promocoes";
import { pendentesDeConferencia } from "@/lib/promocaoAvisos";
import { listarLimites } from "@/lib/limiteQuantitativoDb";
import { cruzarComEfetivo } from "@/lib/limiteQuantitativo";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { envioEncerrado } from "@/lib/promocaoPrazo";
import { prazoDoPeriodo } from "@/lib/promocaoPrazoDb";
import { marcarRecebimentoVisto, recebimentoVisto } from "@/lib/avisoCertidoesDb";

/* =========================================================================
   AS QUATRO FONTES DO SININHO, NUM LUGAR SÓ

   Antes cada fonte era uma rota separada, e o sino chamava as quatro de uma
   vez — quatro requisições, quatro conferências de sessão, para montar uma
   lista só. As rotas continuam existindo (nada quebra), mas agora todas
   chamam as funções daqui, e o /api/pulso monta a lista inteira com UMA
   conferência de sessão apenas.

   Toda fonte engole os próprios erros e devolve lista vazia: o sino não pode
   sumir da tela porque uma tabela ainda não existe ou o banco piscou.
   ========================================================================= */

export type Notificacao = {
  id: string; texto: string; em: string; href?: string;
  /* Que AÇÃO a notificação pede (só as de permuta usam, por ora). É o que o
     aviso ao entrar (pendenciasAoEntrar) olha para separar o que exige ação
     do que é só acompanhamento. O sino ignora. */
  acao?: "assinar" | "parecer" | "acompanhar" | "ciencia" | "visto";
};

export type Quem = {
  login?: string | null;
  perfil?: string | null;
  refEfetivo?: string | null;
};

export const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/* Permutas que exigem AÇÃO deste usuário:
   - policial: permutas aguardando a assinatura dele (como solicitado)
   - Chefe do P/1: permutas aguardando o PARECER
   - Subcmt: permutas aguardando o VISTO (parecer nao favoravel) */
export async function notificacoesPermutas(quem: Quem): Promise<Notificacao[]> {
  const meuId = (quem.refEfetivo || null) as string | null;
  const admin = ehAdmin(quem.perfil);
  try {
    const podeP1 = await podeComoEncargo(meuId, "chefe_p1", admin); // pode assinar
    const veP1 = await podeVerP1(meuId, admin);                     // Chefe + Auxiliares
    const podeSub = await podeComoEncargo(meuId, "subcmt", admin);
    // só as que podem interessar a este usuário, filtradas no banco
    const pedidos = await permutasParaOSino(meuId, veP1, podeSub);
    const nots: Notificacao[] = [];
    for (const p of pedidos) {
      if (meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado") {
        nots.push({
          id: "assinar:" + p.id,
          texto: `${p.solicitante.linha} pediu permuta com você — dia ${dBR(p.dataPermuta)}. Assine o "concordo".`,
          em: p.criadoEm,
          acao: "assinar",
        });
      } else if (veP1 && p.estado === "aguardando_p1") {
        // Chefe do P/1 assina; auxiliares recebem para acompanhar (não assinam).
        nots.push({
          id: "p1:" + p.id,
          texto: podeP1
            ? `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu parecer (Chefe do P/1).`
            : `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} para acompanhamento do P/1 (o parecer é do Chefe).`,
          em: p.criadoEm,
          acao: podeP1 ? "parecer" : "acompanhar",
        });
      } else if (meuId && (p.solicitanteId === meuId || p.solicitadoId === meuId)
                 && (p.estado === "autorizada" || p.estado === "nao_autorizada")
                 && !(p.solicitanteId === meuId ? p.cienciaSolicitante : p.cienciaSolicitado)) {
        // decisão saiu: avisa o policial e pede a ciência (some ao dar ciência)
        nots.push({
          id: "ciencia:" + p.id,
          texto: `Sua permuta (${p.protocolo || ""}) foi ${p.estado === "autorizada" ? "AUTORIZADA" : "NÃO autorizada"}. Toque para dar ciência da decisão.`,
          em: p.p1Em || p.criadoEm,
          acao: "ciencia",
        });
      } else if (podeSub && p.estado === "aguardando_subcmt") {
        nots.push({
          id: "subcmt:" + p.id,
          texto: `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu visto (Subcomandante).`,
          em: p.criadoEm,
          acao: "visto",
        });
      }
    }
    nots.sort((a, b) => (b.em || "").localeCompare(a.em || ""));
    return nots;
  } catch { return []; }
}

/* Alertas de segurança (só admin): contas BLOQUEADAS nas últimas 24h. */
export async function alertasSeguranca(quem: Quem): Promise<Notificacao[]> {
  if (!ehAdmin(quem.perfil)) return [];
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // só os bloqueios e só os campos do aviso (o registro de auditoria é longo)
    const regs = await prisma.auditoria.findMany({
      where: { acao: "login_falha", quando: { gte: desde }, detalhe: { contains: "BLOQUEADA" } },
      orderBy: { quando: "desc" },
      take: 20,
      select: { id: true, autorLogin: true, ip: true, quando: true },
    });
    return regs.map((r) => ({
      id: "bloq-" + r.id,
      texto: `🔒 Conta bloqueada: ${r.autorLogin || "—"} (${r.ip || "IP ?"})`,
      em: r.quando.toISOString(),
    }));
  } catch { return []; }
}

/* Conversas com mensagem não lida — uma linha por remetente, não por
   mensagem, para não entupir o sino. */
export async function notificacoesChat(quem: Quem): Promise<Notificacao[]> {
  const eu = quem.login || "";
  if (!eu) return [];
  try {
    await garantirChatSilencioso();

    const naoLidas = await prisma.chatMensagem.findMany({
      // mensagem apagada para todos não fica tocando o sino
      where: { para: eu, lidaEm: null, apagadaEm: null },
      orderBy: { criadoEm: "desc" },
      take: 120,
      select: { id: true, de: true, texto: true, arqNome: true, arqTipo: true, criadoEm: true },
    });
    if (naoLidas.length === 0) return [];

    const porRemetente = new Map<string, { qtd: number; ultima: typeof naoLidas[0] }>();
    for (const m of naoLidas) {
      const atual = porRemetente.get(m.de);
      if (atual) atual.qtd += 1;
      else porRemetente.set(m.de, { qtd: 1, ultima: m });
    }

    const logins = [...porRemetente.keys()];
    const usuarios = await prisma.usuario.findMany({
      where: { login: { in: logins } },
      select: { login: true, nomeCompleto: true, refEfetivo: true },
    });
    const ids = usuarios.map((u) => u.refEfetivo).filter(Boolean) as string[];
    const fichas = ids.length
      ? await prisma.efetivo.findMany({
          where: { id: { in: ids } },
          select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
        })
      : [];
    const ficha = new Map(fichas.map((f) => [f.id, f]));
    const nomeDe = new Map(
      usuarios.map((u) => {
        const f = u.refEfetivo ? ficha.get(u.refEfetivo) : null;
        const n = (f?.nomeGuerra || f?.nome || u.nomeCompleto || u.login).toString().trim();
        return [u.login, [f?.postoGrad, n].filter(Boolean).join(" ")];
      })
    );

    const nots = [...porRemetente.entries()].map(([login, d]) => {
      const quemMandou = nomeDe.get(login) || login;
      const previa = d.ultima.texto?.trim()
        ? d.ultima.texto.trim().slice(0, 70)
        : d.ultima.arqTipo?.startsWith("audio/")
        ? "🎤 Mensagem de voz"
        : d.ultima.arqTipo?.startsWith("image/")
        ? "🖼 Foto"
        : "📎 " + (d.ultima.arqNome || "arquivo");
      return {
        // o id muda quando chega mensagem nova, então o sino volta a piscar
        id: "chat:" + login + ":" + d.ultima.id,
        texto: d.qtd > 1
          ? `${quemMandou} — ${d.qtd} mensagens novas: “${previa}”`
          : `${quemMandou}: “${previa}”`,
        em: d.ultima.criadoEm.toISOString(),
        href: "/chat?com=" + encodeURIComponent(login),
      };
    });
    nots.sort((a, b) => b.em.localeCompare(a.em));
    return nots;
  } catch {
    // tabela ainda não criada, ou banco fora — o sino simplesmente não mostra chat
    return [];
  }
}

/* Memorandos de férias/LP: para o P/1, os que aguardam a assinatura da seção;
   para o militar, o aviso de que o dele ficou pronto. */
export async function notificacoesFerias(quem: Quem): Promise<Notificacao[]> {
  const admin = ehAdmin(quem.perfil);
  const meuId = (quem.refEfetivo || "") as string;
  /* As 400 assinaturas de memorando mais recentes, agrupadas por documento —
     tudo DENTRO do banco. Antes as 400 linhas vinham para cá de minuto em
     minuto, para cada usuário logado, e quase todas eram descartadas; agora
     só sai do banco o que vira aviso. Mesma regra de antes: o "militar" é a
     assinatura mais recente do próprio militar, e o "chefe" a mais recente de
     qualquer outro papel. */
  const JANELA = `WITH ultimas AS (
      SELECT tipo, ref, papel, nome, em FROM assinatura_sigep
       WHERE tipo IN ('memorando_ferias','memorando_lp')
       ORDER BY em DESC LIMIT 400)`;
  try {
    const nots: Notificacao[] = [];
    if (admin) {
      // assinados pelo militar e ainda sem a assinatura da seção
      const pendentes: any[] = await prisma.$queryRawUnsafe(
        `${JANELA}
         SELECT tipo, ref,
                (array_agg(nome ORDER BY em DESC) FILTER (WHERE papel = 'militar'))[1] AS nome,
                MAX(em) FILTER (WHERE papel = 'militar') AS em
           FROM ultimas
          GROUP BY tipo, ref
         HAVING bool_or(papel = 'militar') AND NOT bool_or(papel <> 'militar')`
      );
      for (const d of pendentes) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo:" + d.tipo + ":" + d.ref,
          texto: `${d.nome} assinou o memorando de ${oQue}. Aguardando a assinatura da seção.`,
          em: new Date(d.em).toISOString(),
          href: "/ferias",
        });
      }
    }
    if (meuId) {
      // os meus que a seção já assinou
      const prontos: any[] = await prisma.$queryRawUnsafe(
        `${JANELA}
         SELECT tipo, ref,
                (array_agg(nome ORDER BY em DESC) FILTER (WHERE papel <> 'militar'))[1] AS nome,
                MAX(em) FILTER (WHERE papel <> 'militar') AS em
           FROM ultimas
          WHERE LEFT(ref, LENGTH($1) + 1) = $1 || ':'
          GROUP BY tipo, ref
         HAVING bool_or(papel <> 'militar')`,
        meuId,
      );
      for (const d of prontos) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo-ok:" + d.tipo + ":" + d.ref,
          texto: `Seu memorando de ${oQue} foi assinado por ${d.nome}. Já pode baixar.`,
          em: new Date(d.em).toISOString(),
          href: "/minhas-ferias",
        });
      }
    }
    nots.sort((a, b) => b.em.localeCompare(a.em));
    return nots.slice(0, 40);
  } catch {
    // tabela de assinaturas ainda não criada — o sino simplesmente não mostra
    return [];
  }
}

/* Requerimento de premiação pecuniária: o policial foi incluído num pedido
   coletivo por outra pessoa e ainda não assinou.

   É a única notificação do sino que nasce de alguém ter posto o SEU NOME num
   documento. Por isso ela não some sozinha com o tempo: só sai da lista
   quando o policial assina (SIGEP), quando ele marca que vai assinar pelo
   Gov.br, ou quando tiram o nome dele do requerimento. Enquanto houver a
   pendência, ela continua ali.

   Quem montou o requerimento não é avisado do próprio documento — ele acabou
   de criá-lo. */
export async function notificacoesPecunia(quem: Quem): Promise<Notificacao[]> {
  const itens = await pendenciasPecunia(quem);
  return itens.map((r) => {
    const quem = r.montouVoce
      ? `Você montou o requerimento de premiação pecuniária ${r.id}.`
      : `${r.criadoPorNome || "O P/1"} incluiu você no requerimento de premiação pecuniária ${r.id}.`;
    /* O que falta muda o recado. Mandar "falta assinar" para quem ainda nem
       informou a conta faria a pessoa ir assinar primeiro — e aí o
       requerimento teria de ser reaberto para ela preencher, derrubando as
       assinaturas de quem já tinha assinado. */
    const falta = r.semConta ? "Informe seus dados bancários e assine." : "Falta a sua assinatura.";
    return { id: "pecunia:" + r.id, texto: `${quem} ${falta}`, em: r.criadoEm, href: r.href };
  });
}

/* O que este policial tem PENDENTE nos requerimentos de premiação — a mesma
   conta serve ao sino e ao aviso que aparece logo depois do login
   (/api/pendencias). Uma fonte só, para os dois nunca
   discordarem sobre o que falta. */
export type PendenciaPecunia = {
  id: string;
  criadoPorNome: string;
  criadoEm: string;
  montouVoce: boolean;     // foi ele mesmo quem montou (o texto do aviso muda)
  semConta: boolean;       // falta a conta DELE
  faltamOutros: number;    // de quantos colegas ainda falta a conta (trava o SIGEP)
  quantidade: number;      // policiais no requerimento
  href: string;
};

export async function pendenciasPecunia(quem: Quem): Promise<PendenciaPecunia[]> {
  const meuId = (quem.refEfetivo || "") as string;
  if (!meuId) return [];
  try {
    const meus = await envolvemEfetivo(meuId);
    if (!meus.length) return [];

    const assinei = await refsAssinadas(TIPO_ASSINATURA, meus.map((r) => refAssinatura(r.id, meuId)));
    const pendentes = meus.filter((r) => !assinei.has(refAssinatura(r.id, meuId)));
    if (!pendentes.length) return [];

    const out: PendenciaPecunia[] = [];
    for (const r of pendentes.slice(0, 20)) {
      /* Só agora o JSON é aberto, e só dos que interessam: para saber se o
         policial já resolveu a linha dele marcando o Gov.br. */
      const doc = await lerPecunia(r.id);
      const minha = doc?.dados.linhas.find((l) => l.efetivoId === meuId);
      if (!doc || !minha || minha.assinarGov) continue;
      out.push({
        id: r.id,
        criadoPorNome: r.criadoPorNome || "",
        criadoEm: r.criadoEm,
        montouVoce: !!quem.login && r.criadoPor === quem.login,
        semConta: faltaBanco(minha),
        faltamOutros: doc.dados.linhas.filter((l) => l !== minha && faltaBanco(l)).length,
        quantidade: doc.dados.linhas.length,
        href: "/requerimentos/premiacao?id=" + encodeURIComponent(r.id),
      });
    }
    out.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
    return out;
  } catch {
    // tabela ainda não criada — o sino simplesmente não mostra esta fonte
    return [];
  }
}

/* Certidões de promoção esperando o P/1 conferir.

   So para quem responde pela conferencia (Chefe/Aux P/1, ou admin enquanto
   nao houver Chefe cadastrado — a mesma regra de podeVerP1). Uma linha so,
   com a contagem: em epoca de promocao seriam dezenas de envios, e uma linha
   por militar enterraria o resto do sino. O id leva a contagem, entao cada
   envio novo volta a acender o sino. */
export async function notificacoesPromocao(quem: Quem): Promise<Notificacao[]> {
  try {
    if (!(await podeVerP1(quem.refEfetivo || null, ehAdmin(quem.perfil)))) return [];
    const periodo = await periodoAtivo();
    if (!periodo) return [];
    const n = await pendentesDeConferencia(periodo.id);
    if (!n) return [];
    return [{
      id: `promo-p1:${periodo.id}:${n}`,
      texto: n === 1
        ? `1 militar enviou as certidões da ${periodo.nome} e aguarda a conferência do P/1.`
        : `${n} militares enviaram as certidões da ${periodo.nome} e aguardam a conferência do P/1.`,
      em: new Date().toISOString(),
      href: "/promocoes",
    }];
  } catch {
    return [];
  }
}

/* A lista completa do sino, na MESMA ordem que ele montava quando fazia as
   quatro chamadas: segurança, férias, chat, permutas — com a premiação
   pecuniária logo depois dos memorandos, que é o assunto mais próximo. */
export async function todasNotificacoes(quem: Quem): Promise<Notificacao[]> {
  const [seg, fer, pec, pro, cha, per] = await Promise.all([
    alertasSeguranca(quem),
    notificacoesFerias(quem),
    notificacoesPecunia(quem),
    notificacoesPromocao(quem),
    notificacoesChat(quem),
    notificacoesPermutas(quem),
  ]);
  return [...seg, ...fer, ...pec, ...pro, ...cha, ...per];
}

/* =========================================================================
   O QUE ESPERA AÇÃO DESTE USUÁRIO — para o aviso logo depois do login
   (components/AvisoAoEntrar, via /api/pendencias).

   O sino mostra tudo; o aviso ao entrar mostra só o que PRECISA de alguém
   agir, porque ele interrompe a tela: chat, alertas de segurança e "seu
   memorando ficou pronto" ficam só no sino. Sai das MESMAS funções do sino,
   para os dois nunca discordarem.

   Agrupado por assunto: o Chefe do P/1 com oito permutas na fila vê um
   cartão "8 permutas aguardando o seu parecer", não oito cartões.
   ========================================================================= */
export type CartaoPendencia = {
  id: string;
  assunto: "permuta" | "promocao" | "ferias";
  titulo: string;
  linhas: string[];        // até 3 exemplos, para saber do que se trata
  mais: number;            // quantos além dos exemplos
  botao: string;
  href: string;
};

/* "Parabéns, você está no Limite Quantitativo": o policial está na lista da
   CPPPM (a que o P/1 subiu em Promoções → Limite Quantitativo) do ciclo
   mais recente. Some quando ele envia as certidões ao P/1 no período aberto
   — aí o recado já cumpriu o papel. */
export type ParabensLimite = { gradDestino: string; ciclo: string; ord: number | null; quadro: string };

const MESES_LQ = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ordemCicloLQ = (c: string) => {
  const m = (c || "").match(/^(\S+) de (\d{4})$/);
  return m ? Number(m[2]) * 100 + (MESES_LQ.indexOf(m[1]) + 1) : 0;
};

export async function parabensLimite(quem: Quem): Promise<ParabensLimite | null> {
  const meuId = (quem.refEfetivo || "") as string;
  if (!meuId) return null;
  try {
    const eu = await prisma.efetivo.findUnique({
      where: { id: meuId },
      select: { id: true, nome: true, nomeGuerra: true, matricula: true, numeroBarra: true, postoGrad: true, lotacao: true },
    });
    if (!eu) return null;
    const listas = await listarLimites();
    if (!listas.length) return null;
    // só o ciclo mais recente (o de ciclo não reconhecido conta como o atual)
    const atual = Math.max(...listas.map((l) => ordemCicloLQ(l.ciclo)));
    for (const l of listas) {
      const oc = ordemCicloLQ(l.ciclo);
      if (oc && oc < atual && oc >= 202001) continue;
      const achado = cruzarComEfetivo(l.linhas, [eu]).find((x) => x.efetivoId === meuId);
      if (!achado) continue;
      const periodo = await periodoAtivo();
      if (periodo) {
        const st = await statusP1(periodo.id, meuId);
        if (st?.enviadoEm) return null;   // já enviou ao P/1
        // passou do prazo de envio: não chama mais para enviar
        if (envioEncerrado(await prazoDoPeriodo(periodo.id), st)) return null;
      }
      const ciclo = oc >= 202001 ? l.ciclo : (listas.find((x) => ordemCicloLQ(x.ciclo) === atual)?.ciclo || "");
      return { gradDestino: l.gradDestino, ciclo, ord: achado.ord, quadro: achado.quadro };
    }
    return null;
  } catch { return null; }
}

/* O resultado das certidões, na tela do policial (pedido do P/1):
     · recebido -> "suas certidões foram conferidas e recebidas", UMA vez;
     · reaberto -> "o P/1 reabriu: há certidão para corrigir", até ele
       enviar de novo (é coisa a fazer, como as outras pendências). */
export type AvisoCertidoes = { tipo: "recebido" | "reaberto"; em: string };

export async function avisoCertidoes(quem: Quem): Promise<AvisoCertidoes | null> {
  const meuId = (quem.refEfetivo || "") as string;
  if (!meuId) return null;
  try {
    const periodo = await periodoAtivo();
    if (!periodo) return null;
    const st = await statusP1(periodo.id, meuId);
    if (st?.recebidoEm) {
      return (await recebimentoVisto(periodo.id, meuId)) === st.recebidoEm ? null : { tipo: "recebido", em: st.recebidoEm };
    }
    // reaberto, mas o prazo já passou (e ele não foi liberado): não há o que corrigir
    if (st?.reabertoEm && !st.enviadoEm && !envioEncerrado(await prazoDoPeriodo(periodo.id), st)) {
      return { tipo: "reaberto", em: st.reabertoEm };
    }
    return null;
  } catch { return null; }
}

// o policial fechou a janela que mostrava o recebido: não mostra mais
export async function marcarAvisoCertidoesVisto(quem: Quem): Promise<void> {
  const meuId = (quem.refEfetivo || "") as string;
  const periodo = meuId ? await periodoAtivo() : null;
  if (!periodo) return;
  const st = await statusP1(periodo.id, meuId);
  if (st?.recebidoEm) await marcarRecebimentoVisto(periodo.id, meuId, st.recebidoEm);
}

export type PendenciasAoEntrar = {
  pecunia: PendenciaPecunia[]; outras: CartaoPendencia[]; limite: ParabensLimite | null;
  certidoes: AvisoCertidoes | null;
};

export async function pendenciasAoEntrar(quem: Quem): Promise<PendenciasAoEntrar> {
  const [pecunia, permutas, promocao, ferias, limite, certidoes] = await Promise.all([
    pendenciasPecunia(quem),
    notificacoesPermutas(quem),
    notificacoesPromocao(quem),
    notificacoesFerias(quem),
    parabensLimite(quem),
    avisoCertidoes(quem),
  ]);

  const cartao = (
    id: string, assunto: CartaoPendencia["assunto"], itens: Notificacao[],
    titulo: (n: number) => string, botao: string, href: string,
  ): CartaoPendencia | null => itens.length
    ? { id, assunto, titulo: titulo(itens.length), linhas: itens.slice(0, 3).map((n) => n.texto), mais: Math.max(0, itens.length - 3), botao, href }
    : null;

  const de = (a: Notificacao["acao"]) => permutas.filter((n) => n.acao === a);
  const outras = [
    // primeiro o que é do próprio policial...
    cartao("permuta-assinar", "permuta", de("assinar"),
      (n) => n === 1 ? "Um colega pediu permuta com você" : `${n} colegas pediram permuta com você`,
      "Ver e assinar o concordo", "/permutas"),
    cartao("permuta-ciencia", "permuta", de("ciencia"),
      (n) => n === 1 ? "Saiu a decisão da sua permuta" : `Saiu a decisão de ${n} permutas suas`,
      "Ver e dar ciência", "/permutas"),
    // ...depois o que é da função dele
    cartao("permuta-parecer", "permuta", de("parecer"),
      (n) => n === 1 ? "1 permuta aguardando o seu parecer" : `${n} permutas aguardando o seu parecer`,
      "Dar o parecer", "/permutas"),
    cartao("permuta-visto", "permuta", de("visto"),
      (n) => n === 1 ? "1 permuta aguardando o seu visto" : `${n} permutas aguardando o seu visto`,
      "Dar o visto", "/permutas"),
    cartao("promocao-conferir", "promocao", promocao,
      () => "Certidões de promoção para conferir", "Conferir as certidões", "/promocoes"),
    cartao("ferias-secao", "ferias", ferias.filter((n) => n.id.startsWith("memo:")),
      (n) => n === 1 ? "1 memorando aguardando a assinatura da seção" : `${n} memorandos aguardando a assinatura da seção`,
      "Assinar os memorandos", "/ferias"),
  ].filter((c): c is CartaoPendencia => !!c);

  return { pecunia, outras, limite, certidoes };
}
