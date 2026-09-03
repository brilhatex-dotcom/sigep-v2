import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerListaoVarios, combinarLeituras, dataSugeridaDoListao } from "@/lib/promocaoListao";
import { lerDiarioOficial } from "@/lib/promocaoDoe";
import { cruzarListao, type FichaEfetivo } from "@/lib/promocaoCruzar";
import { garantirPromocoes } from "@/lib/promocaoDb";

export const dynamic = "force-dynamic";

/* /api/promocoes/listao
   POST { textos: string[] } -> lê o listão e devolve quem do 18º BPM foi
   promovido. São VÁRIOS textos porque o mesmo papel é lido de mais de um
   jeito no navegador, e o que uma leitura perde a outra costuma achar (ver
   ocrListao.ts). Aceita { texto } sozinho também, para o campo de correção
   à mão da tela.

   NÃO promove ninguém: só monta a lista para o P/1 conferir na tela. O texto
   chega pronto do navegador (que faz o OCR, quando o PDF é escaneado) — o
   servidor não recebe o arquivo, só o texto lido.

   Só administrador: a lista mostra matrícula e posto de todo o efetivo. */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if ((u.perfil ?? "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Só o P/1 pode importar o listão." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const textos: string[] = Array.isArray(b?.textos)
      ? b.textos.filter((t: unknown) => typeof t === "string")
      : typeof b?.texto === "string" ? [b.texto] : [];
    if (!textos.some((t) => t.trim())) {
      return NextResponse.json({ error: "Nenhum texto para ler." }, { status: 400 });
    }

    /* Os dois documentos que a PMMA publica têm formatos diferentes, e o
       arquivo pode ser qualquer um dos dois: o listão da CPPPM (praças,
       fotocopiado) ou o Diário Oficial (oficiais, com texto). Em vez de pedir
       para o P/1 dizer qual é, tenta os dois leitores e fica com o que
       entendeu — se por acaso o arquivo trouxer os dois, os dois entram. */
    const leitura = combinarLeituras([
      lerListaoVarios(textos),
      lerDiarioOficial(textos.join("\n")),
    ]);
    if (leitura.linhas.length === 0) {
      return NextResponse.json({
        error:
          "Não reconheci nenhuma linha de promoção neste arquivo. Confira se é mesmo a relação de " +
          "promovidos e se as páginas foram lidas por inteiro.",
        ignoradas: leitura.ignoradas.slice(0, 10),
      }, { status: 422 });
    }

    /* Só o efetivo ATIVO entra no cruzamento: quem saiu da corporação não
       deve ser promovido por engano. */
    const fichas = await prisma.efetivo.findMany({
      select: {
        id: true, nome: true, nomeGuerra: true, postoGrad: true,
        matricula: true, numeroBarra: true, situacao: true, lotacao: true, fotoURL: true,
      },
    });
    const ativos = fichas.filter((f) => {
      const s = (f.situacao || "").toLowerCase();
      return !s.includes("excluido") && !s.includes("excluído") && !s.includes("morto") && !s.includes("demitido");
    }) as FichaEfetivo[];

    const r = cruzarListao(leitura.linhas, ativos);

    /* Quem do batalhão está no posto de origem de alguma seção e NÃO apareceu
       no listão. Serve para o P/1 bater o olho: "faltou alguém?" */
    const achadosIds = new Set(r.achados.map((a) => a.efetivoId));
    const postosDeOrigem = new Set(leitura.linhas.map((l) => l.deOrdem));
    const { classificarPatente } = await import("@/lib/patentes");
    const naoApareceram = ativos
      .filter((f) => !achadosIds.has(f.id) && postosDeOrigem.has(classificarPatente(f.postoGrad).ordem))
      .map((f) => ({
        id: f.id,
        nome: (f.nome || f.nomeGuerra || "").trim(),
        postoGrad: f.postoGrad || "",
        numeroBarra: f.numeroBarra || "",
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    // garante o histórico já aqui, para o "Aplicar" não falhar depois
    await garantirPromocoes().catch(() => {});

    return NextResponse.json({
      titulo: leitura.titulo,
      /* Data do ato: o "a contar de" quando o aviso da CPPPM veio junto,
         senão o último dia do mês do título (regra da CPPPM). */
      dataSugerida: dataSugeridaDoListao(textos.join("\n") + "\n" + leitura.titulo),
      totalNoListao: leitura.linhas.length,
      ignoradas: leitura.ignoradas.slice(0, 20),
      achados: r.achados,
      deFora: r.deFora,
      duplicados: r.duplicados,
      naoApareceram,
    });
  } catch (err) {
    console.error("[POST /api/promocoes/listao]", err);
    return NextResponse.json({ error: "Falha ao ler o listão." }, { status: 500 });
  }
}
