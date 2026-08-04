import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* /api/escala/reducao-judicial
   RESTRIÇÕES DE ESCALA por militar. Duas coisas, no mesmo registro:

     · percentual — teto MÁXIMO de serviços no mês (ex.: 50 = só metade),
       tipicamente por determinação judicial;
     · dias — em quais dias da semana ele PODE ser escalado (0=domingo ...
       6=sábado). Vazio = todos. Ex.: [0,6] para quem só entra no fim de
       semana, como o militar que estuda durante a semana.

   As duas se combinam: fim de semana + 50% = metade dos fins de semana da
   equipe dele no mês. O motor distribui sozinho; o escalante ainda pode
   escalar além, com confirmação.

   A chave do Config continua "reducao_judicial" para não perder o que já
   está cadastrado; registros antigos (sem "dias") seguem valendo.
     GET  -> { reducoes: [{ idPmma, nome, percentual, dias, motivo }] }
     POST (admin) { idPmma, nome?, percentual?, dias?, motivo? }
          -> define/atualiza; sem teto e sem restrição de dias, remove */
const CHAVE = "reducao_judicial";

type Reducao = { idPmma: string; nome: string; percentual: number; dias: number[]; motivo: string };

/** Normaliza a lista de dias: só 0..6, sem repetido, em ordem. 7 dias = sem restrição. */
function diasLimpos(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const s = new Set<number>();
  for (const x of v) { const n = Math.trunc(Number(x)); if (n >= 0 && n <= 6) s.add(n); }
  const out = [...s].sort((a, b) => a - b);
  return out.length === 7 ? [] : out;
}

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}
function ler(v?: string | null): Reducao[] {
  try {
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a)
      ? a.filter((x) => x && x.idPmma).map((x) => ({
          idPmma: String(x.idPmma),
          nome: String(x.nome || ""),
          percentual: Number(x.percentual) || 0,
          dias: diasLimpos(x.dias),
          motivo: String(x.motivo || ""),
        }))
      : [];
  } catch { return []; }
}
async function salvar(lista: Reducao[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Restricoes de escala por militar: teto percentual no mes e dias da semana permitidos" },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  return NextResponse.json({ reducoes: lista });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    if (!idPmma) return NextResponse.json({ error: "Informe o militar." }, { status: 400 });
    let lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const atual = lista.find((r) => r.idPmma === idPmma);

    // Campo ausente no corpo = mantém o que já estava (permite mexer só nos
    // dias sem zerar o percentual, e vice-versa).
    let pct = atual?.percentual ?? 0;
    if (b?.percentual !== undefined) {
      const n = Math.round(Number(b.percentual));
      pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    }
    const dias = b?.dias !== undefined ? diasLimpos(b.dias) : (atual?.dias ?? []);
    const motivo = b?.motivo !== undefined ? String(b.motivo || "").trim() : (atual?.motivo ?? "");

    lista = lista.filter((r) => r.idPmma !== idPmma); // idempotente
    const temTeto = pct > 0 && pct < 100;
    const temDias = dias.length > 0;
    if (temTeto || temDias) {
      lista.push({ idPmma, nome: String(b?.nome || atual?.nome || "").trim(), percentual: temTeto ? pct : 0, dias, motivo });
    }
    await salvar(lista);
    return NextResponse.json({ ok: true, percentual: temTeto ? pct : 0, dias, motivo });
  } catch (err) {
    console.error("[POST /api/escala/reducao-judicial]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
