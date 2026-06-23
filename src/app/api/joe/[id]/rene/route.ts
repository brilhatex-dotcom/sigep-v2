import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarReneDocx } from "@/lib/rene";

export const dynamic = "force-dynamic";

function ehAdmin(perfil?: string | null): boolean {
  const p = (perfil || "").toLowerCase();
  return p !== "" && p !== "policial";
}

function dataBR(iso: string): string {
  if (!iso || iso.length < 10) return iso || "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) {
    return NextResponse.json({ error: "Apenas o P1 pode gerar a RENE" }, { status: 403 });
  }

  try {
    const joe = await prisma.joe.findUnique({
      where: { id: params.id },
      include: { inscricoes: { where: { status: "aprovado" }, orderBy: { decididoEm: "asc" } } },
    });
    if (!joe) return NextResponse.json({ error: "JOE nao encontrado" }, { status: 404 });
    if (joe.inscricoes.length === 0) {
      return NextResponse.json({ error: "Nenhum candidato aprovado neste JOE ainda" }, { status: 400 });
    }

    const fichas = await prisma.efetivo.findMany({
      where: { id: { in: joe.inscricoes.map((i) => i.efetivoId) } },
    });
    const mapaFicha: Record<string, (typeof fichas)[number]> = {};
    for (const f of fichas) mapaFicha[f.id] = f;

    const pessoas = joe.inscricoes.map((insc, idx) => {
      const f = mapaFicha[insc.efetivoId];
      return {
        ord: String(idx + 1).padStart(2, "0"),
        nome: f?.nome || insc.efetivoId,
        id: f?.id || insc.efetivoId,
        cpf: f?.cpf || "",
        upm: "18º BPM",
        contato: f?.telefone || "",
      };
    });

    const buffer = await gerarReneDocx({
      operacao: joe.evento,
      upm: "18º BPM",
      comandante: joe.comandanteOp || "",
      data: dataBR(joe.data),
      horario: joe.horario || `${joe.horaInicio} às ${joe.horaFim}`,
      area: joe.areaAtuacao || joe.local || "",
      processoSei: joe.processoSei || "",
      pessoas,
    });

    const nomeArquivo = `RENE_${joe.evento.replace(/[^a-zA-Z0-9]+/g, "_")}.docx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/joe/[id]/rene]", err);
    return NextResponse.json({ error: "Falha ao gerar a RENE" }, { status: 500 });
  }
}