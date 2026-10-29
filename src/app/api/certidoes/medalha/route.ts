import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/auditoria";
import { abrevPosto } from "@/lib/refMilitar";
import { classificarPatente } from "@/lib/patentes";
import { paraData, tempoServico, dataBR } from "@/lib/datas";
import { hojeLocal } from "@/lib/situacao";
import { lerHistorico } from "@/lib/historicoDb";
import { normalizar } from "@/lib/historicoPolicial";
import { anoDaBarra, faixaDaMedalha } from "@/lib/relatorioCampos";
import {
  ANOS_MEDALHA, REQUISITOS_MEDALHA, UPM, nomeArquivoCertidaoMedalha,
  type AnosMedalha, type DadosCertidaoMedalha,
} from "@/lib/certidaoMedalha";
import { gerarCertidaoMedalhaDocx } from "@/lib/certidaoMedalhaDocx";

export const dynamic = "force-dynamic";

/* /api/certidoes/medalha   (só o P/1)
   GET  ?efetivoId=X -> os dados da certidão, já preenchidos pela ficha:
        militar, matrícula, ID, inclusão, BG de inclusão (do Histórico
        Policial, se já estiver lá), a medalha sugerida pelo tempo de serviço
        e quem assina (o Chefe do P/1 da escala).
   POST {dados}       -> o Word (.docx) da certidão, com o que o P/1 conferiu. */

async function soP1() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { erro: NextResponse.json({ error: "Nao autorizado" }, { status: 401 }) };
  if ((session.user.perfil ?? "").toLowerCase() !== "admin") {
    return { erro: NextResponse.json({ error: "Somente o P/1." }, { status: 403 }) };
  }
  return { session };
}

// "SD PM 169/24 GLEYDSON ROBSON ROCHA DA SILVA" — praça é sempre PM; oficial, o quadro da ficha
function identificacao(f: { postoGrad: string | null; quadro: string | null; numeroBarra: string | null; nome: string | null; nomeGuerra: string | null }): string {
  const oficial = classificarPatente(f.postoGrad).ordem <= 7;
  const quadro = oficial ? (f.quadro || "").trim().toUpperCase() : "PM";
  const posto = abrevPosto(f.postoGrad || "");
  const barra = (f.numeroBarra || "").replace(/^[-–—\s]+$/, "").trim();
  const nome = (f.nome || f.nomeGuerra || "").trim().toUpperCase();
  return [posto, quadro && !posto.split(/\s+/).includes(quadro) ? quadro : "", barra, nome].filter(Boolean).join(" ");
}

async function quemAssina(): Promise<{ chefe: string; chefeFuncao: string }> {
  const padrao = { chefe: "1º TEN QOEM PAULO SILAS BARROS DE BRITO JUNIOR", chefeFuncao: `Chefe do P/1 do ${UPM}` };
  try {
    const row = await prisma.config.findUnique({ where: { chave: "escala_chefe_p1" } });
    const v = row?.valor ? JSON.parse(row.valor) : {};
    const funcao = typeof v.funcao === "string" && v.funcao.trim() ? v.funcao.trim() : "";
    return {
      chefe: typeof v.nome === "string" && v.nome.trim() ? v.nome.trim() : padrao.chefe,
      // "CHEFE DO P/1 DO 18º BPM" -> "Chefe do P/1 do 18º BPM", como no modelo
      chefeFuncao: funcao ? funcao.toLowerCase().replace(/^chefe/, "Chefe").replace(/p\/1/, "P/1").replace(/bpm/, "BPM") : padrao.chefeFuncao,
    };
  } catch {
    return padrao;
  }
}

export async function GET(req: Request) {
  const a = await soP1();
  if (a.erro) return a.erro;
  const efetivoId = (new URL(req.url).searchParams.get("efetivoId") || "").trim();
  if (!efetivoId) return NextResponse.json({ error: "Escolha o policial." }, { status: 400 });

  const f = await prisma.efetivo.findUnique({
    where: { id: efetivoId },
    select: { id: true, postoGrad: true, quadro: true, numeroBarra: true, nome: true, nomeGuerra: true, matricula: true, dataIncorp: true },
  });
  if (!f) return NextResponse.json({ error: "Policial não encontrado." }, { status: 404 });

  const [hist, assina] = await Promise.all([lerHistorico(efetivoId).catch(() => null), quemAssina()]);
  const bg = hist ? normalizar(JSON.parse(hist.dados || "{}")).campos.bgInclusao || "" : "";

  // tempo de serviço: pela inclusão; sem ela, pelo ano da barra (aproximado)
  const hoje = hojeLocal();
  const incl = paraData(f.dataIncorp);
  const anoBarra = incl ? null : anoDaBarra(f.numeroBarra);
  const anosServico = incl ? tempoServico(incl, hoje).anos : anoBarra ? hoje.getFullYear() - anoBarra : null;
  const faixa = faixaDaMedalha(anosServico) as AnosMedalha | null;

  return NextResponse.json({
    militar: identificacao(f),
    matricula: (f.matricula || "").trim(),
    idPmma: f.id,
    dataInclusao: incl ? dataBR(f.dataIncorp) : "",
    bgInclusao: bg.replace(/^n[ºo°]\s*/i, ""),
    anosServico,
    tempoPelaBarra: !incl && anosServico !== null,
    anos: faixa ?? 10,
    temDireito: faixa !== null,
    ...assina,
  });
}

export async function POST(req: Request) {
  const a = await soP1();
  if (a.erro) return a.erro;
  const b = await req.json().catch(() => ({}));
  const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

  const anos = Number(b?.anos) as AnosMedalha;
  if (!ANOS_MEDALHA.includes(anos)) return NextResponse.json({ error: "Escolha a medalha (10, 20 ou 30 anos)." }, { status: 400 });
  const d: DadosCertidaoMedalha = {
    anos,
    militar: s(b?.militar),
    matricula: s(b?.matricula, 40),
    idPmma: s(b?.idPmma, 40),
    dataInclusao: s(b?.dataInclusao, 20),
    bgInclusao: s(b?.bgInclusao, 80),
    requisitos: REQUISITOS_MEDALHA.map((_, i) => b?.requisitos?.[i] !== false),
    chefe: s(b?.chefe),
    chefeFuncao: s(b?.chefeFuncao),
    cidade: s(b?.cidade, 60) || "Presidente Dutra",
    data: /^\d{4}-\d{2}-\d{2}$/.test(s(b?.data)) ? s(b?.data) : new Date().toISOString().slice(0, 10),
  };
  if (!d.militar) return NextResponse.json({ error: "Escolha o policial." }, { status: 400 });

  try {
    const buf = await gerarCertidaoMedalhaDocx(d);
    await registrar({
      acao: "certidao_medalha", alvo: d.idPmma || d.militar,
      detalhe: `Gerou a Certidão para Medalha do Serviço Policial Militar (${d.anos} anos) de ${d.militar}.`,
    });
    const nome = nomeArquivoCertidaoMedalha(d);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="certidao.docx"; filename*=UTF-8''${encodeURIComponent(nome)}.docx`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[POST /api/certidoes/medalha]", e);
    return NextResponse.json({ error: "Falha ao gerar a certidão." }, { status: 500 });
  }
}
