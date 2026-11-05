import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { souAdmin } from "@/lib/guard";
import { lugarDoUsuario, filtrarPeloLugar } from "@/lib/lugarUsuario";
import { registrar } from "@/lib/auditoria";
import { lerBaixados, salvarBaixados, novaBaixa, hojeBatalhao } from "@/lib/escalaBaixados";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/escala/baixados — a chave "NÃO ESCALAR — BAIXADO DO SERVIÇO ATIVO".

     GET               -> { baixados: { [idPmma]: { desde, jmsInicio, por, em } } }
     POST { idPmma, baixado: true|false }
                       -> liga (o policial sai da escala) ou desliga (volta)

   Quem monta a escala: o admin (qualquer policial) e o Cmt/sargenteante de um
   lugar (só os policiais do próprio lugar). Cada mudança vai para a
   auditoria. O efeito na escala vem de /api/escala/afastamentos-plano.
   ========================================================================= */

async function quemPode() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { session: null, admin: false, lugar: null };
  const admin = souAdmin(session);
  const lugar = admin ? null : await lugarDoUsuario((session.user as any).refEfetivo).catch(() => null);
  return { session, admin, lugar };
}

export async function GET() {
  const { session, admin, lugar } = await quemPode();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!admin && !lugar) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  return NextResponse.json({ baixados: await lerBaixados() });
}

export async function POST(req: Request) {
  const { session, admin, lugar } = await quemPode();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!admin && !lugar) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  try {
    const b = await req.json().catch(() => ({}));
    const idPmma = String(b?.idPmma || "").trim();
    const ligar = b?.baixado === true;
    if (!idPmma) return NextResponse.json({ error: "Informe o policial." }, { status: 400 });

    const ficha = await prisma.efetivo.findUnique({
      where: { id: idPmma },
      select: { id: true, postoGrad: true, nomeGuerra: true, nome: true, lotacao: true, jmsDataInicio: true, jmsDataRetorno: true },
    });
    if (!ficha) return NextResponse.json({ error: "Policial não encontrado no efetivo." }, { status: 404 });
    // o comando de um lugar só mexe nos policiais do próprio lugar
    if (!admin && !filtrarPeloLugar([ficha], lugar).length) {
      return NextResponse.json({ error: "Este policial não é do seu lugar." }, { status: 403 });
    }

    const mapa = await lerBaixados();
    const antes = mapa[idPmma] || null;
    const por = String(session.user?.name || (session.user as any)?.login || "—");
    if (ligar) mapa[idPmma] = novaBaixa(ficha, hojeBatalhao(), por);
    else delete mapa[idPmma];
    await salvarBaixados(mapa);

    const nome = [ficha.postoGrad, ficha.nomeGuerra || ficha.nome].filter(Boolean).join(" ");
    await registrar({
      acao: ligar ? "escala_baixado_ligar" : "escala_baixado_desligar",
      alvo: idPmma, alvoNome: nome,
      detalhe: ligar
        ? `Não escalar — baixado do serviço ativo, a partir de ${mapa[idPmma].desde.split("-").reverse().join("/")}` +
          (mapa[idPmma].jmsInicio ? " (até o retorno do JMS)." : " (até desligar).")
        : "Voltou a ser escalado (chave de baixado desligada).",
      antes: antes ?? null,
      depois: ligar ? mapa[idPmma] : null,
    });
    return NextResponse.json({ ok: true, baixado: ligar ? mapa[idPmma] : null });
  } catch (err) {
    console.error("[POST /api/escala/baixados]", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
