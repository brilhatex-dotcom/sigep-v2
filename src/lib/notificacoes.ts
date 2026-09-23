import { prisma } from "@/lib/prisma";
import { lerPermutas } from "@/lib/permutaPedidos";
import { podeComoEncargo, podeVerP1 } from "@/lib/encargos";
import { garantirChatSilencioso } from "@/lib/chatDb";
import { envolvemEfetivo, lerPecunia, refAssinatura, TIPO_ASSINATURA, faltaBanco } from "@/lib/requerimentoPecunia";
import { refsAssinadas } from "@/lib/assinaturaSigep";
import { periodoAtivo } from "@/lib/promocoes";
import { pendentesDeConferencia } from "@/lib/promocaoAvisos";

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

export type Notificacao = { id: string; texto: string; em: string; href?: string };

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
    const pedidos = await lerPermutas();
    const nots: Notificacao[] = [];
    for (const p of pedidos) {
      if (meuId && p.solicitadoId === meuId && p.estado === "aguardando_solicitado") {
        nots.push({
          id: "assinar:" + p.id,
          texto: `${p.solicitante.linha} pediu permuta com você — dia ${dBR(p.dataPermuta)}. Assine o "concordo".`,
          em: p.criadoEm,
        });
      } else if (veP1 && p.estado === "aguardando_p1") {
        // Chefe do P/1 assina; auxiliares recebem para acompanhar (não assinam).
        nots.push({
          id: "p1:" + p.id,
          texto: podeP1
            ? `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu parecer (Chefe do P/1).`
            : `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} para acompanhamento do P/1 (o parecer é do Chefe).`,
          em: p.criadoEm,
        });
      } else if (meuId && (p.solicitanteId === meuId || p.solicitadoId === meuId)
                 && (p.estado === "autorizada" || p.estado === "nao_autorizada")
                 && !(p.solicitanteId === meuId ? p.cienciaSolicitante : p.cienciaSolicitado)) {
        // decisão saiu: avisa o policial e pede a ciência (some ao dar ciência)
        nots.push({
          id: "ciencia:" + p.id,
          texto: `Sua permuta (${p.protocolo || ""}) foi ${p.estado === "autorizada" ? "AUTORIZADA" : "NÃO autorizada"}. Toque para dar ciência da decisão.`,
          em: p.p1Em || p.criadoEm,
        });
      } else if (podeSub && p.estado === "aguardando_subcmt") {
        nots.push({
          id: "subcmt:" + p.id,
          texto: `Permuta ${p.solicitante.linha} ⇄ ${p.solicitado?.linha || p.solicitadoNome} aguardando o seu visto (Subcomandante).`,
          em: p.criadoEm,
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
    const regs = await prisma.auditoria.findMany({
      where: { acao: "login_falha", quando: { gte: desde } },
      orderBy: { quando: "desc" },
      take: 50,
    });
    return regs
      .filter((r) => (r.detalhe || "").includes("BLOQUEADA"))
      .slice(0, 20)
      .map((r) => ({
        id: "bloq-" + r.id,
        texto: `🔒 Conta bloqueada: ${r.autorLogin || "—"} (${(r as any).ip || "IP ?"})`,
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
  try {
    const linhas: any[] = await prisma.$queryRawUnsafe(
      `SELECT tipo, ref, papel, nome, em FROM assinatura_sigep
        WHERE tipo IN ('memorando_ferias','memorando_lp')
        ORDER BY em DESC LIMIT 400`
    );
    if (!linhas.length) return [];

    type Doc = { tipo: string; ref: string; militar?: any; chefe?: any };
    const doc = new Map<string, Doc>();
    for (const l of linhas) {
      const k = l.tipo + "|" + l.ref;
      const d: Doc = doc.get(k) || { tipo: String(l.tipo), ref: String(l.ref) };
      if (l.papel === "militar") { if (!d.militar) d.militar = l; }
      else if (!d.chefe) d.chefe = l;
      doc.set(k, d);
    }

    const nots: Notificacao[] = [];
    if (admin) {
      for (const d of [...doc.values()].filter((x) => x.militar && !x.chefe)) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo:" + d.tipo + ":" + d.ref,
          texto: `${d.militar.nome} assinou o memorando de ${oQue}. Aguardando a assinatura da seção.`,
          em: new Date(d.militar.em).toISOString(),
          href: "/ferias",
        });
      }
    }
    if (meuId) {
      for (const d of [...doc.values()].filter((x) => x.ref.startsWith(meuId + ":") && x.chefe)) {
        const oQue = d.tipo === "memorando_lp" ? "licença-prêmio" : "férias";
        nots.push({
          id: "memo-ok:" + d.tipo + ":" + d.ref,
          texto: `Seu memorando de ${oQue} foi assinado por ${d.chefe.nome}. Já pode baixar.`,
          em: new Date(d.chefe.em).toISOString(),
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
  const meuId = (quem.refEfetivo || "") as string;
  if (!meuId) return [];
  try {
    const meus = await envolvemEfetivo(meuId);
    if (!meus.length) return [];

    const assinei = await refsAssinadas(TIPO_ASSINATURA, meus.map((r) => refAssinatura(r.id, meuId)));
    const pendentes = meus.filter((r) => !assinei.has(refAssinatura(r.id, meuId)));
    if (!pendentes.length) return [];

    const nots: Notificacao[] = [];
    for (const r of pendentes.slice(0, 20)) {
      /* Só agora o JSON é aberto, e só dos que interessam: para saber se o
         policial já resolveu a linha dele marcando o Gov.br. */
      const doc = await lerPecunia(r.id);
      const minha = doc?.dados.linhas.find((l) => l.efetivoId === meuId);
      if (!minha || minha.assinarGov) continue;
      const quemPos = r.criadoPorNome || "O P/1";
      /* O que falta muda o recado. Mandar "falta assinar" para quem ainda nem
         informou a conta faria a pessoa ir assinar primeiro — e aí o
         requerimento teria de ser reaberto para ela preencher, derrubando as
         assinaturas de quem já tinha assinado. */
      const oQueFalta = faltaBanco(minha)
        ? "Informe seus dados bancários e assine."
        : "Falta a sua assinatura.";
      nots.push({
        id: "pecunia:" + r.id,
        texto: `${quemPos} incluiu você no requerimento de premiação pecuniária ${r.id}. ${oQueFalta}`,
        em: r.criadoEm,
        href: "/requerimentos/premiacao?id=" + encodeURIComponent(r.id),
      });
    }
    nots.sort((a, b) => (b.em || "").localeCompare(a.em || ""));
    return nots;
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
