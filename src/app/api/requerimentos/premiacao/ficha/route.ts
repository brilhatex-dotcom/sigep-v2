import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* =========================================================================
   Dados da ficha para o REQUERIMENTO DE PREMIAÇÃO PECUNIÁRIA.

   POR QUE UMA ROTA PRÓPRIA, e não ampliar a /api/efetivo:

   banco, agência e conta estão em CAMPOS_SENSIVEIS — o sistema os guarda
   CIFRADOS no banco, de propósito. A /api/efetivo responde a qualquer usuário
   logado e alimenta meia dúzia de telas; incluir os dados bancários ali
   entregaria a conta de todo policial do Batalhão a todo mundo que abre o
   sistema, e jogaria fora a razão de terem sido cifrados.

   Aqui a regra é estreita:
     · ADMIN (P/1)  -> vê os dados bancários de quem for pedido;
     · demais       -> só os próprios.
   O resto da ficha (posto, quadro, matrícula, ID) não é sigiloso e vai para
   qualquer um — é o que já aparece na escala e no mapa.

   Quem preenche este requerimento na prática é o P/1, então o caminho normal
   traz tudo. Um policial montando o documento do próprio grupo recebe os
   colegas sem a parte bancária e digita — o que é o certo: ninguém deveria
   conseguir puxar a conta do colega por uma tela.
   ========================================================================= */

const ehAdmin = (perfil?: string | null) => (perfil || "").toLowerCase() === "admin";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const u = session.user as any;
  const admin = ehAdmin(u.perfil);
  const meu = (u.refEfetivo || "") as string;

  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  if (!ids.length) return NextResponse.json({ fichas: [] });

  try {
    const linhas = await prisma.efetivo.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, postoGrad: true, quadro: true, nome: true, nomeGuerra: true,
        matricula: true, banco: true, agencia: true, conta: true, tipoConta: true,
      },
    });

    return NextResponse.json({
      fichas: linhas.map((f) => {
        const podeBanco = admin || f.id === meu;
        return {
          id: f.id,
          /* O ID PMMA É a chave da ficha. Nos policiais de 2018 para cá ele é
             igual à matrícula; nos mais antigos, diferente. O "nº 863/14" que
             aparece na escala é a numeração da graduação — outra coisa. */
          idPmma: f.id,
          matricula: f.matricula || "",
          /* Cargo com o quadro: "1º Tenente QOEM", "Major QOE". Praça não tem
             quadro, então sai só a graduação ("SD"). */
          cargo: [f.postoGrad, f.quadro].map((x) => (x || "").trim()).filter(Boolean).join(" "),
          nome: f.nome || f.nomeGuerra || "",
          banco: podeBanco ? (f.banco || "") : "",
          agencia: podeBanco ? (f.agencia || "") : "",
          conta: podeBanco ? (f.conta || "") : "",
          tipoConta: podeBanco ? (f.tipoConta || "") : "",
          bancoOculto: !podeBanco,
        };
      }),
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/premiacao/ficha]", err);
    return NextResponse.json({ error: "Falha ao ler as fichas" }, { status: 500 });
  }
}
