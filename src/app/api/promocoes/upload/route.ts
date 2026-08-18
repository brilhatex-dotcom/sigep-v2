import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { urlAssinadaUpload } from "@/lib/r2";
import { periodoAtivo } from "@/lib/promocoes";
import { TOTAL_CERTIDOES } from "@/lib/certidoes";
import { statusP1 } from "@/lib/promocaoStatusP1";
import { chaveCertidao, LIMITE_CERTIDAO_BYTES } from "@/lib/promocaoUpload";

export const dynamic = "force-dynamic";

/* POST /api/promocoes/upload   { ordem, tam, efetivoId? } -> { url, key }

   PREPARA o envio de uma certidao: devolve uma URL assinada para o NAVEGADOR
   mandar o PDF DIRETO ao R2. Depois de subir, o navegador chama
   /api/promocoes/upload/confirmar para gravar no banco.

   Antes o PDF subia por aqui dentro (multipart). Nao dava: a Vercel corta
   requisicao acima de ~4,5 MB, e certidao digitalizada passa disso com
   facilidade — o militar so via "Falha no envio", sem saber por que. E o
   mesmo caminho que o chat ja usa para os anexos de 20 MB. */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });

  const periodo = await periodoAtivo();
  if (!periodo) {
    return NextResponse.json({ erro: "Nenhum período de promoção aberto." }, { status: 400 });
  }

  try {
    const b = await req.json().catch(() => ({}));
    const ordem = parseInt(String(b?.ordem ?? ""), 10);
    const tam = Number(b?.tam);

    // admin pode enviar pela ficha de outro; policial so pela propria
    const ehAdmin = (session.user.perfil ?? "").toLowerCase() === "admin";
    const efetivoId = ehAdmin && b?.efetivoId ? String(b.efetivoId) : session.user.refEfetivo;

    if (!efetivoId) {
      return NextResponse.json(
        { erro: "Seu usuário não está vinculado a uma ficha de efetivo." },
        { status: 400 }
      );
    }
    if (!ordem || ordem < 1 || ordem > TOTAL_CERTIDOES) {
      return NextResponse.json({ erro: "Certidão inválida." }, { status: 400 });
    }
    if (!Number.isFinite(tam) || tam <= 0) {
      return NextResponse.json({ erro: "Tamanho de arquivo inválido." }, { status: 400 });
    }
    if (tam > LIMITE_CERTIDAO_BYTES) {
      return NextResponse.json(
        {
          erro: `Arquivo de ${(tam / 1048576).toFixed(1)} MB. O limite é ${
            LIMITE_CERTIDAO_BYTES / 1048576
          } MB.`,
        },
        { status: 413 }
      );
    }

    // Depois de protocolado no P/1, o lote fica travado. A tela ja desabilita
    // os botoes, mas a trava tem que valer aqui tambem: senao bastava uma
    // chamada direta a API para trocar um arquivo que o P/1 ja conferiu.
    // Para destravar, o P/1 usa o botao "Reabrir" no painel.
    const st = await statusP1(periodo.id, efetivoId);
    if (st?.enviadoEm) {
      return NextResponse.json(
        { erro: "Estas certidões já foram enviadas ao P/1 e estão travadas. Peça ao P/1 para reabrir antes de trocar." },
        { status: 409 }
      );
    }

    const key = chaveCertidao(periodo.id, efetivoId, ordem);
    const url = await urlAssinadaUpload(key, "application/pdf");
    return NextResponse.json({ url, key });
  } catch (e) {
    console.error("[POST /api/promocoes/upload]", e);
    return NextResponse.json({ erro: "Falha ao preparar o envio." }, { status: 500 });
  }
}
