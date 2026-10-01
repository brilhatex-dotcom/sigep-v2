import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { garantirChatSilencioso } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/contatos
   Lista com quem da para conversar (todos os usuarios ativos), marcando:
   - online  : bateu presenca nos ultimos 70 s
   - naoLidas: mensagens dele para mim ainda nao lidas
   - previa  : ultima mensagem trocada e quando
   Ordem: quem tem mensagem nova primeiro, depois conversa mais recente,
   depois os demais por nome. */

const JANELA_ONLINE = 70_000; // ms

/* QUEM ESTÁ NO CHAT — a parte que quase nunca muda (login, nome, posto,
   lotação, se tem foto). É a maior parte da resposta e era relida do banco a
   cada poucos segundos para cada usuário com o chat aberto, pesando na cota de
   tráfego do Neon (5 GB/mês). Agora fica 5 min na memória deste servidor; o
   que muda de verdade (online, não lidas, última mensagem) continua vindo do
   banco a cada chamada. Login novo aparece em até 5 minutos. */
type Pessoa = {
  login: string; nomeCompleto: string | null; perfil: string | null; refEfetivo: string | null;
  postoGrad: string | null; nome: string | null; nomeGuerra: string | null; lotacao: string | null;
  fotoV: string | null; // versão da foto (muda quando a foto muda); null = sem foto
};
const LISTA_MS = 5 * 60_000;
let lista: { em: number; pessoas: Pessoa[] } | null = null;

async function pessoasDoChat(): Promise<Pessoa[]> {
  if (lista && Date.now() - lista.em < LISTA_MS) return lista.pessoas;

  const usuarios = await prisma.usuario.findMany({
    select: { login: true, nomeCompleto: true, perfil: true, refEfetivo: true, ativo: true },
  });
  const ativos = usuarios.filter((u) => {
    const a = (u.ativo ?? "").toString().trim().toLowerCase();
    return a === "" || a === "sim" || a === "true" || a === "1" || a === "ativo";
  });

  /* Fichas para posto/graduação e lotação. A foto não vem: só uma VERSÃO dela
     (md5 curto calculado no próprio banco), que vai no endereço do avatar —
     assim o navegador guarda a imagem e só baixa de novo quando ela muda. */
  const ids = Array.from(new Set(ativos.map((u) => u.refEfetivo).filter(Boolean) as string[]));
  const fichas = ids.length
    ? await prisma.$queryRaw<
        { id: string; postoGrad: string | null; nome: string | null; nomeGuerra: string | null; lotacao: string | null; fotoV: string | null }[]
      >(Prisma.sql`
        SELECT e."ID" AS "id", e."Posto_Grad" AS "postoGrad", e."Nome" AS "nome",
               e."NomeGuerra" AS "nomeGuerra", e."Lotacao" AS "lotacao",
               CASE
                 WHEN COALESCE(e."FotoURL", '') = '' THEN NULL
                 WHEN e."FotoURL" LIKE 'config:%' THEN
                   (SELECT LEFT(md5(COALESCE(c."Valor", '')), 10) FROM config c WHERE c."Chave" = SUBSTRING(e."FotoURL" FROM 8))
                 ELSE LEFT(md5(e."FotoURL"), 10)
               END AS "fotoV"
          FROM efetivo e
         WHERE e."ID" IN (${Prisma.join(ids)})
      `)
    : [];
  const ficha = new Map(fichas.map((f) => [f.id, f]));

  const pessoas = ativos.map((u) => {
    const f = u.refEfetivo ? ficha.get(u.refEfetivo) : null;
    return {
      login: u.login, nomeCompleto: u.nomeCompleto, perfil: u.perfil, refEfetivo: u.refEfetivo,
      postoGrad: f?.postoGrad ?? null, nome: f?.nome ?? null, nomeGuerra: f?.nomeGuerra ?? null,
      lotacao: f?.lotacao ?? null, fotoV: f?.fotoV ?? null,
    };
  });
  lista = { em: Date.now(), pessoas };
  return pessoas;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const ativos = (await pessoasDoChat()).filter((p) => p.login !== eu);

    // presenca
    const limite = new Date(Date.now() - JANELA_ONLINE);
    const presentes = await prisma.chatPresenca.findMany({
      where: { visto: { gte: limite } },
      select: { login: true },
    });
    const online = new Set(presentes.map((p) => p.login));

    // nao lidas por remetente
    const naoLidas = await prisma.chatMensagem.groupBy({
      by: ["de"],
      where: { para: eu, lidaEm: null },
      _count: { _all: true },
    });
    const mapaNaoLidas = new Map(naoLidas.map((n) => [n.de, n._count._all]));

    /* Ultima mensagem de cada conversa, ja reduzida no banco (DISTINCT ON) e
       com o texto cortado na previa. Antes vinham as 400 mensagens mais
       recentes, com o texto inteiro, so para sobrar uma linha por conversa —
       e esta rota roda de poucos em poucos segundos para cada usuario logado,
       entao o trafego de saida do Neon (cota de 5 GB/mes) ia embora aqui. */
    const recentes = await prisma.$queryRaw<
      { de: string; para: string; texto: string | null; arqNome: string | null; arqTipo: string | null; apagadaEm: Date | null; criadoEm: Date }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (CASE WHEN "De" = ${eu} THEN "Para" ELSE "De" END)
        "De" AS "de", "Para" AS "para", LEFT("Texto", 120) AS "texto",
        "ArqNome" AS "arqNome", "ArqTipo" AS "arqTipo",
        "ApagadaEm" AS "apagadaEm", "CriadoEm" AS "criadoEm"
      FROM "chat_mensagens"
      WHERE "De" = ${eu} OR "Para" = ${eu}
      ORDER BY (CASE WHEN "De" = ${eu} THEN "Para" ELSE "De" END), "CriadoEm" DESC
    `);
    const ultima = new Map<string, { previa: string; em: string }>();
    for (const m of recentes) {
      const outro = m.de === eu ? m.para : m.de;
      if (ultima.has(outro)) continue;
      // a prévia acompanha o que a conversa mostra: voz, foto, apagada...
      const quem = m.de === eu ? "Você: " : "";
      const corpo = m.apagadaEm
        ? "🚫 mensagem apagada"
        : m.texto?.trim()
        ? m.texto.trim()
        : m.arqTipo?.startsWith("audio/")
        ? "🎤 Mensagem de voz"
        : m.arqTipo?.startsWith("image/")
        ? "🖼 Foto"
        : "📎 " + (m.arqNome || "anexo");
      const previa = quem + corpo;
      ultima.set(outro, { previa: previa.slice(0, 90), em: m.criadoEm.toISOString() });
    }

    /* Como EU organizei cada conversa (fixada, arquivada, silenciada, marcada
       como não lida). Uma consulta só, e o chat funciona igual sem nenhuma
       linha: tudo cai no padrão. */
    let prefs = new Map<string, { fixada: boolean; arquivada: boolean; naoLida: boolean; silenciadaAte: Date | null }>();
    try {
      const linhas = await prisma.chatConversa.findMany({ where: { login: eu } });
      prefs = new Map(linhas.map((p) => [p.com, p]));
    } catch { /* tabela ainda nao criada: segue sem preferencias */ }
    const agora = Date.now();

    const contatos = ativos.map((u) => {
      const nome =
        (u.nomeGuerra || u.nome || u.nomeCompleto || u.login || "").toString().trim() || u.login;
      const ult = ultima.get(u.login);
      const pref = prefs.get(u.login);
      return {
        login: u.login,
        nome,
        postoGrad: u.postoGrad,
        lotacao: u.lotacao,
        admin: (u.perfil ?? "").toLowerCase() === "admin",
        // avatar só quando o militar tem foto cadastrada; "h" = versão da foto
        foto: u.fotoV && u.refEfetivo
          ? `/api/foto/${encodeURIComponent(u.refEfetivo)}?avatar=1&h=${encodeURIComponent(u.fotoV)}`
          : null,
        online: online.has(u.login),
        naoLidas: mapaNaoLidas.get(u.login) ?? 0,
        previa: ult?.previa ?? "",
        em: ult?.em ?? null,
        fixada: !!pref?.fixada,
        arquivada: !!pref?.arquivada,
        // marcada à mão: só vale enquanto não chega mensagem nova de verdade
        naoLidaManual: !!pref?.naoLida,
        silenciada: !!(pref?.silenciadaAte && pref.silenciadaAte.getTime() > agora),
      };
    });

    contatos.sort((a, b) => {
      // fixadas sempre no topo, como no WhatsApp
      if (a.fixada !== b.fixada) return a.fixada ? -1 : 1;
      if ((b.naoLidas > 0 ? 1 : 0) !== (a.naoLidas > 0 ? 1 : 0)) return (b.naoLidas > 0 ? 1 : 0) - (a.naoLidas > 0 ? 1 : 0);
      if (a.em && b.em && a.em !== b.em) return b.em.localeCompare(a.em);
      if (!!b.em !== !!a.em) return b.em ? 1 : -1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });

    return NextResponse.json({ contatos, eu, instalado: true });
  } catch (err: any) {
    // P2021 = a tabela ainda nao existe (falta rodar "npm run db:push").
    // Devolve um aviso claro em vez de uma lista vazia sem explicacao.
    if (err?.code === "P2021") {
      return NextResponse.json({ contatos: [], instalado: false });
    }
    console.error("[GET /api/chat/contatos]", err);
    return NextResponse.json({ contatos: [], instalado: true });
  }
}
