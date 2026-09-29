import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dataBR } from "@/lib/requerimentoDados";

export const dynamic = "force-dynamic";

/* =========================================================================
   GET /api/requerimentos/alienante?id=<ID PMMA>
   Dados da ficha do ALIENANTE (quem passa a arma) para o requerimento de
   transferência e o termo de doação, já com as chaves do formulário.

   Mesma regra estreita da ficha da premiação:
     · posto, nome, ID, RG e CPF -> para qualquer usuário logado (é o que a
       /api/efetivo já entrega ao buscador de militares);
     · estado civil, nascimento, naturalidade e filiação -> só o ADMIN (P/1)
       ou o próprio militar. Um policial montando a transferência dele recebe
       o colega sem essa parte e pede ao alienante — ninguém deveria conseguir
       puxar a filiação do colega por uma tela.
   ========================================================================= */

const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const u = session.user as any;
  const id = (new URL(req.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const f = await prisma.efetivo.findUnique({
      where: { id },
      select: {
        id: true, postoGrad: true, nome: true, rg: true, cpf: true,
        estadoCivil: true, dataNasc: true, naturalidade: true, naturalidadeUF: true,
        nomePai: true, nomeMae: true,
      },
    });
    if (!f) return NextResponse.json({ error: "Militar nao encontrado" }, { status: 404 });

    const completo = ehAdmin(u.perfil) || f.id === (u.refEfetivo || "");
    const dados: Record<string, string> = {
      alienanteId: f.id,
      alienantePosto: f.postoGrad || "",
      alienanteNome: f.nome || "",
      // "Identidade:" da folha — o ID PMMA, como no adquirente
      alienanteIdentidade: f.id,
      alienanteRg: f.rg || "",
      alienanteCpf: f.cpf || "",
      alienanteOrgao: "PMMA",
    };
    if (completo) {
      dados.alienanteEstadoCivil = f.estadoCivil || "";
      dados.alienanteNasc = dataBR(f.dataNasc);
      dados.alienanteNaturalidade = [f.naturalidade, f.naturalidadeUF]
        .map((x) => (x || "").trim()).filter(Boolean).join(" - ");
      dados.alienantePai = f.nomePai || "";
      dados.alienanteMae = f.nomeMae || "";
    }

    return NextResponse.json({ dados, parcial: !completo });
  } catch (err) {
    console.error("[GET /api/requerimentos/alienante]", err);
    return NextResponse.json({ error: "Falha ao ler a ficha" }, { status: 500 });
  }
}
