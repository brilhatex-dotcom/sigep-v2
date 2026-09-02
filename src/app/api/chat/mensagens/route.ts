import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarParaLogin } from "@/lib/push";
import { garantirChatSilencioso, deveNotificar } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/* /api/chat/mensagens
   GET    ?com=<login>[&depois=<ISO>]  -> conversa com essa pessoa; marca como
                                          lidas as que ela me mandou.
          ?com=<login>&busca=<texto>   -> procura DENTRO da conversa (inclusive
                                          em mensagem antiga, fora do lote).
   POST   { para, texto?, arq?, respondeA? }   -> envia (texto e/ou anexo,
                                          podendo citar outra) e dispara push.
   POST   { para, encaminharDe: <id> }  -> encaminha uma mensagem que eu já
                                          tenho para outra pessoa.
   PATCH  { id, texto }               -> edita o texto de uma mensagem MINHA.
   DELETE ?id=<id>                    -> apaga para todos uma mensagem MINHA. */

const LIMITE = 200;

/* Reações da mensagem, agrupadas do jeito que o balão mostra:
   [{ emoji: "👍", qtd: 2, minha: true }] */
function reacoesDe(json: string | null, eu: string) {
  if (!json) return [];
  let bruto: Record<string, string> = {};
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object" && !Array.isArray(v)) bruto = v;
  } catch { return []; }
  const mapa = new Map<string, { emoji: string; qtd: number; minha: boolean }>();
  for (const [login, emoji] of Object.entries(bruto)) {
    if (typeof emoji !== "string" || !emoji) continue;
    const atual = mapa.get(emoji) || { emoji, qtd: 0, minha: false };
    atual.qtd += 1;
    if (login === eu) atual.minha = true;
    mapa.set(emoji, atual);
  }
  return [...mapa.values()];
}

// Prévia curta da mensagem citada, para o balão mostrar sem outra consulta.
function trechoDe(m: { texto: string | null; arqNome: string | null; arqTipo: string | null; apagadaEm: Date | null }): string {
  if (m.apagadaEm) return "mensagem apagada";
  if (m.texto?.trim()) return m.texto.trim().slice(0, 120);
  if (m.arqTipo?.startsWith("audio/")) return "🎤 Mensagem de voz";
  if (m.arqTipo?.startsWith("image/")) return "🖼 Foto";
  return "📎 " + (m.arqNome || "arquivo");
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const com = (url.searchParams.get("com") || "").trim();
  const depois = url.searchParams.get("depois");
  const busca = (url.searchParams.get("busca") || "").trim();
  if (!com) return NextResponse.json({ error: "Informe com quem" }, { status: 400 });

  try {
    await garantirChatSilencioso();

    const where: any = {
      OR: [
        { de: eu, para: com },
        { de: com, para: eu },
      ],
    };
    if (depois) {
      const d = new Date(depois);
      if (!isNaN(d.getTime())) where.criadoEm = { gt: d };
    }
    /* Busca dentro da conversa: procura no texto, ignorando maiúsculas, e
       ignora as apagadas (não têm mais conteúdo para casar). */
    if (busca) {
      where.texto = { contains: busca, mode: "insensitive" };
      where.apagadaEm = null;
    }

    const msgs = await prisma.chatMensagem.findMany({
      where,
      orderBy: { criadoEm: depois ? "asc" : "desc" },
      take: busca ? 50 : LIMITE,
    });
    const lista = depois ? msgs : msgs.reverse();

    /* Mensagens citadas que não estão neste lote (ex.: a citada é antiga e ficou
       fora do limite). Busca só as que faltam, de uma vez. */
    const naMao = new Map(lista.map((m) => [m.id, m]));
    const faltando = [...new Set(lista.map((m) => m.respondeA).filter((x): x is string => !!x && !naMao.has(x)))];
    const extras = faltando.length
      ? await prisma.chatMensagem.findMany({ where: { id: { in: faltando } } })
      : [];
    for (const m of extras) naMao.set(m.id, m);

    const citacaoDe = (id: string | null) => {
      if (!id) return null;
      const alvo = naMao.get(id);
      if (!alvo) return null; // citada apagada de vez / fora do alcance
      return { id: alvo.id, minha: alvo.de === eu, trecho: trechoDe(alvo) };
    };

    /* Abrir a conversa marca como lidas as que ela me mandou e desfaz o
       "marcar como não lida". No modo BUSCA não mexe em nada: procurar uma
       mensagem antiga não é o mesmo que ler a conversa. */
    if (!busca) {
      await prisma.chatMensagem.updateMany({
        where: { de: com, para: eu, lidaEm: null },
        data: { lidaEm: new Date() },
      });
      try {
        await prisma.chatConversa.updateMany({
          where: { login: eu, com, naoLida: true },
          data: { naoLida: false },
        });
      } catch { /* sem a tabela ainda: segue */ }
    }

    return NextResponse.json({
      mensagens: lista.map((m) => {
        const apagada = !!m.apagadaEm;
        return {
          id: m.id,
          minha: m.de === eu,
          // apagada para todos: não devolve conteúdo nenhum, só a marca
          texto: apagada ? null : m.texto,
          arqKey: apagada ? null : m.arqKey,
          arqNome: apagada ? null : m.arqNome,
          arqTipo: apagada ? null : m.arqTipo,
          arqTam: apagada ? null : m.arqTam,
          em: m.criadoEm.toISOString(),
          lida: !!m.lidaEm,
          lidaEm: m.lidaEm ? m.lidaEm.toISOString() : null,
          editada: !!m.editadaEm,
          apagada,
          encaminhada: !!m.encaminhada && !apagada,
          reacoes: apagada ? [] : reacoesDe(m.reacoes, eu),
          citada: apagada ? null : citacaoDe(m.respondeA),
        };
      }),
      busca: busca || null,
    });
  } catch (err) {
    console.error("[GET /api/chat/mensagens]", err);
    return NextResponse.json({ mensagens: [] });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const eu = u?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const b = await req.json();
    const para = String(b?.para || "").trim();
    let texto = typeof b?.texto === "string" ? b.texto.trim().slice(0, 4000) : "";
    let arq = b?.arq || null;
    const respondeAId = typeof b?.respondeA === "string" ? b.respondeA.trim() : "";
    const encaminharDe = typeof b?.encaminharDe === "string" ? b.encaminharDe.trim() : "";
    if (!para) return NextResponse.json({ error: "Destinatario obrigatorio" }, { status: 400 });
    if (para === eu) return NextResponse.json({ error: "Nao da para conversar consigo mesmo" }, { status: 400 });

    /* ENCAMINHAR: copia o conteúdo de uma mensagem que EU já tenho (mandei ou
       recebi) para outra pessoa. O anexo não é re-enviado: a mensagem nova
       aponta para o mesmo arquivo no R2. Só encaminha o que eu poderia ver —
       mensagem de conversa alheia (ou apagada) não passa daqui. */
    let encaminhada = false;
    if (encaminharDe) {
      const origem = await prisma.chatMensagem.findUnique({ where: { id: encaminharDe } });
      if (!origem || (origem.de !== eu && origem.para !== eu)) {
        return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
      }
      if (origem.apagadaEm) {
        return NextResponse.json({ error: "Essa mensagem foi apagada." }, { status: 409 });
      }
      texto = origem.texto || "";
      arq = origem.arqKey
        ? { key: origem.arqKey, nome: origem.arqNome, tipo: origem.arqTipo, tam: origem.arqTam }
        : null;
      encaminhada = true;
    }

    if (!texto && !arq?.key) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });

    const destino = await prisma.usuario.findUnique({ where: { login: para }, select: { login: true } });
    if (!destino) return NextResponse.json({ error: "Destinatario nao encontrado" }, { status: 404 });

    /* A citada precisa ser desta mesma conversa — sem isso daria para citar
       (e revelar um trecho de) mensagem de outra conversa qualquer. */
    let citada: { id: string; minha: boolean; trecho: string } | null = null;
    if (respondeAId) {
      const alvo = await prisma.chatMensagem.findUnique({ where: { id: respondeAId } });
      const daConversa =
        alvo && ((alvo.de === eu && alvo.para === para) || (alvo.de === para && alvo.para === eu));
      if (daConversa) citada = { id: alvo!.id, minha: alvo!.de === eu, trecho: trechoDe(alvo!) };
    }

    const msg = await prisma.chatMensagem.create({
      data: {
        de: eu,
        para,
        texto: texto || null,
        arqKey: arq?.key ? String(arq.key) : null,
        arqNome: arq?.nome ? String(arq.nome).slice(0, 240) : null,
        arqTipo: arq?.tipo ? String(arq.tipo).slice(0, 120) : null,
        arqTam: Number.isFinite(Number(arq?.tam)) ? Number(arq.tam) : null,
        respondeA: citada?.id ?? null,
        encaminhada,
      },
    });

    /* Avisa no celular mesmo com o sistema fechado — a não ser que a pessoa
       tenha silenciado esta conversa ou esteja com ela aberta na tela agora. */
    try {
      if (await deveNotificar(para, eu)) {
        const quem = (u?.name || eu).toString();
        const tipo = String(arq?.tipo || "");
        const resumo = texto
          ? texto.slice(0, 120)
          : tipo.startsWith("audio/")
          ? "🎤 Mensagem de voz"
          : tipo.startsWith("image/")
          ? "🖼 Foto"
          : "📎 " + (arq?.nome || "arquivo");
        // total de não lidas: vira o número na bolinha do ícone do app
        const naoLidas = await prisma.chatMensagem
          .count({ where: { para, lidaEm: null, apagadaEm: null } })
          .catch(() => 0);
        await enviarParaLogin(para, {
          title: "Mensagem de " + quem,
          body: resumo,
          url: "/chat?com=" + encodeURIComponent(eu),
          tag: "chat-" + eu,
          // o Service Worker usa isso para o botão "Marcar como lida"
          tipo: "chat",
          com: eu,
          contador: naoLidas,
        });
      }
    } catch { /* push e best-effort */ }

    return NextResponse.json({
      ok: true,
      mensagem: {
        id: msg.id, minha: true, texto: msg.texto,
        arqKey: msg.arqKey, arqNome: msg.arqNome, arqTipo: msg.arqTipo, arqTam: msg.arqTam,
        em: msg.criadoEm.toISOString(), lida: false, lidaEm: null,
        editada: false, apagada: false, encaminhada, reacoes: [], citada,
      },
    });
  } catch (err) {
    console.error("[POST /api/chat/mensagens]", err);
    return NextResponse.json({ error: "Falha ao enviar" }, { status: 500 });
  }
}

/* Editar o texto de uma mensagem que EU mandei. Anexo não se edita (o arquivo
   já foi entregue); mensagem apagada também não volta atrás. */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const b = await req.json();
    const id = String(b?.id || "").trim();
    const texto = typeof b?.texto === "string" ? b.texto.trim().slice(0, 4000) : "";
    if (!id) return NextResponse.json({ error: "Informe a mensagem" }, { status: 400 });
    if (!texto) return NextResponse.json({ error: "A mensagem não pode ficar vazia." }, { status: 400 });

    const msg = await prisma.chatMensagem.findUnique({ where: { id } });
    if (!msg) return NextResponse.json({ error: "Mensagem nao encontrada" }, { status: 404 });
    if (msg.de !== eu) return NextResponse.json({ error: "Só dá para editar as suas mensagens." }, { status: 403 });
    if (msg.apagadaEm) return NextResponse.json({ error: "Esta mensagem foi apagada." }, { status: 409 });
    if (!msg.texto) return NextResponse.json({ error: "Anexo não pode ser editado." }, { status: 409 });

    const novo = await prisma.chatMensagem.update({
      where: { id },
      data: { texto, editadaEm: new Date() },
    });

    return NextResponse.json({ ok: true, id: novo.id, texto: novo.texto, editada: true });
  } catch (err) {
    console.error("[PATCH /api/chat/mensagens]", err);
    return NextResponse.json({ error: "Falha ao editar" }, { status: 500 });
  }
}

/* Apagar para todos uma mensagem que EU mandei. A linha continua (para a
   conversa não perder a ordem), mas o conteúdo deixa de ser entregue e o
   balão mostra "mensagem apagada", como no WhatsApp. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const eu = (session?.user as any)?.login as string | undefined;
  if (!eu) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    await garantirChatSilencioso();

    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "Informe a mensagem" }, { status: 400 });

    const msg = await prisma.chatMensagem.findUnique({ where: { id } });
    if (!msg) return NextResponse.json({ error: "Mensagem nao encontrada" }, { status: 404 });
    if (msg.de !== eu) return NextResponse.json({ error: "Só dá para apagar as suas mensagens." }, { status: 403 });

    if (!msg.apagadaEm) {
      await prisma.chatMensagem.update({ where: { id }, data: { apagadaEm: new Date() } });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[DELETE /api/chat/mensagens]", err);
    return NextResponse.json({ error: "Falha ao apagar" }, { status: 500 });
  }
}
