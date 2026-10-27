import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idsInativos } from "@/lib/inativos";
import { buscarDocumentos } from "@/lib/documentosOficiaisDb";
import { dataBR } from "@/lib/documentosOficiais";

export const dynamic = "force-dynamic";

/* =========================================================================
   GET /api/busca?q=  — a busca do topo da tela.

   Antes ela só levava à lista de efetivo. Agora procura, de uma vez:
     · militares (só o admin): nome, nome de guerra, matrícula, ID;
     · requerimentos: o admin, todos; o policial, os dele;
     · documentos oficiais: número, assunto e o TEXTO do PDF (o restrito,
       só o admin).
   As telas do menu a própria barra acha (ela já sabe o menu de quem está
   logado). Poucos de cada: é para achar rápido; o "ver todos" leva à tela.
   ========================================================================= */

type Resultado = { titulo: string; sub: string; href: string };

const STATUS: Record<string, string> = {
  rascunho: "rascunho", enviado: "enviado ao P/1", deferido: "deferido", indeferido: "indeferido",
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const u = session.user as any;
  const admin = (u.perfil ?? "").toLowerCase() === "admin";
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ militares: [], requerimentos: [], documentos: [] });

  const contem = { contains: q, mode: "insensitive" as const };
  const digitos = q.replace(/\D/g, "");

  const [militares, requerimentos, documentos] = await Promise.all([
    admin
      ? (async (): Promise<Resultado[]> => {
          const [fichas, inativos] = await Promise.all([
            prisma.efetivo.findMany({
              where: {
                OR: [
                  { nome: contem }, { nomeGuerra: contem },
                  ...(digitos.length >= 3 ? [{ matricula: { contains: digitos } }, { id: { contains: digitos } }] : []),
                ],
              },
              select: { id: true, postoGrad: true, nome: true, nomeGuerra: true, matricula: true, lotacao: true },
              take: 12,
            }),
            idsInativos(),
          ]);
          return fichas
            // quem ainda está na unidade primeiro
            .sort((a, b) => Number(inativos.has(a.id)) - Number(inativos.has(b.id)))
            .slice(0, 6)
            .map((f) => ({
              titulo: [f.postoGrad, f.nome].filter(Boolean).join(" "),
              sub: [f.nomeGuerra && `"${f.nomeGuerra}"`, f.matricula && `mat. ${f.matricula}`, `ID ${f.id}`,
                inativos.has(f.id) ? "saiu da unidade" : f.lotacao].filter(Boolean).join(" · "),
              href: `/efetivo/${encodeURIComponent(f.id)}`,
            }));
        })().catch(() => [])
      : Promise.resolve([] as Resultado[]),
    prisma.requerimento.findMany({
      where: {
        ...(admin ? {} : { efetivoId: u.refEfetivo || "__sem__" }),
        OR: [{ modalidade: contem }, { modalidadeOutros: contem }, { nomeCompleto: contem }, { infoAdicional: contem }, { id: q }],
      },
      select: { id: true, modalidade: true, modalidadeOutros: true, nomeCompleto: true, postoGrad: true, status: true, criadoEm: true },
      orderBy: { criadoEm: "desc" },
      take: 5,
    }).then((rs): Resultado[] => rs.map((r) => ({
      titulo: r.modalidade === "OUTROS" && r.modalidadeOutros ? r.modalidadeOutros : r.modalidade,
      sub: [admin && [r.postoGrad, r.nomeCompleto].filter(Boolean).join(" "), STATUS[r.status] || r.status,
        r.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })].filter(Boolean).join(" · "),
      href: `/requerimentos/${r.id}`,
    }))).catch(() => [] as Resultado[]),
    buscarDocumentos({ q, admin, limite: 5 }).then((ds): Resultado[] => ds.map((d) => ({
      titulo: `${d.tipo}${d.numero ? ` nº ${d.numero}` : ""} · ${dataBR(d.data)}`,
      sub: d.titulo || d.trecho || d.orgao,
      href: `/documentos?q=${encodeURIComponent(q)}`,
    }))).catch(() => [] as Resultado[]),
  ]);

  return NextResponse.json({ militares, requerimentos, documentos }, { headers: { "Cache-Control": "no-store" } });
}
