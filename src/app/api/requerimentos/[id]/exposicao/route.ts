import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nomeDocumento, disposicaoArquivo } from "@/lib/nomeArquivo";
import { militarDoEfetivo } from "@/lib/nomeArquivoServidor";
import { registrar } from "@/lib/auditoria";
import { ehPermanenciaArma } from "@/lib/requerimentos";
import { montarAfastamentos } from "@/lib/afastamentosPlano";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { hojeISO } from "@/lib/gerarParecerArma";
import { gerarExposicaoArmaDocx, periodoDaExposicao } from "@/lib/gerarExposicaoArma";
import { conferirSenha } from "@/lib/senha";
import { criarAssinaturas, assinaturasDoDoc, origemDaRequisicao } from "@/lib/assinaturaSigep";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/* =========================================================================
   /api/requerimentos/[id]/exposicao
   Exposição de motivos do requerimento de AUTORIZAÇÃO DE PERMANÊNCIA DE
   ARMAMENTO (ficar com a arma cautelada nas férias) — o anexo do pedido.

     GET ?sugestao=1          -> { inicio, fim, assinatura, possoAssinar }
     GET ?inicio=..&fim=..    -> o DOCX pronto (datas aaaa-mm-dd; sem elas,
                                 usa o período do plano; sem plano, linhas em branco)
     POST { senha, inicio, fim } -> o REQUERENTE assina no SIGEP (com a senha)

   Assinada, a exposição fica presa às datas que foram assinadas (o lacre
   cobre o militar, a matrícula e o período) e o Word sai com o carimbo SIGEP
   e o QR da verificação pública no lugar da linha de assinatura. Assinar de
   novo, com outras datas, substitui a assinatura anterior.

   Montado na hora a partir do requerimento, como a declaração de parecer
   favorável da aquisição de arma. Dono ou admin.
   ========================================================================= */

const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

const TIPO = "exposicao_arma";
const CHAVE_PERIODOS = "exposicao_arma_periodos"; // { [idRequerimento]: { inicio, fim } } — as datas assinadas

// o que o lacre da assinatura cobre (mudou qualquer coisa = não confere)
function conteudo(r: { id: string; postoGrad: string | null; nomeCompleto: string | null; matricula: string | null }, inicio: string, fim: string) {
  return JSON.stringify({ tipo: TIPO, req: r.id, posto: r.postoGrad || "", nome: r.nomeCompleto || "", matricula: r.matricula || "", inicio, fim });
}

async function lerPeriodos(): Promise<Record<string, { inicio: string; fim: string }>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_PERIODOS } });
    const v = row?.valor ? JSON.parse(row.valor) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

// a assinatura do requerente, se houver, com as datas que ela cobre
async function assinaturaDoRequerente(id: string) {
  const a = (await assinaturasDoDoc(TIPO, id).catch(() => [])).find((x) => x.papel === "militar");
  if (!a) return null;
  const p = (await lerPeriodos())[id] || { inicio: "", fim: "" };
  return { ...a, inicio: iso(p.inicio), fim: iso(p.fim) };
}

const brData = (d: string) => (d ? d.split("-").reverse().join("/") : "?");

/* Período de férias do militar: plano (equipe), férias avulsas e adiamentos —
   a mesma montagem que tira o militar da escala. */
async function feriasDoMilitar(idPmma: string): Promise<{ inicio: string; fim: string } | null> {
  const ano = new Date().getFullYear();
  const anos = [String(ano - 1), String(ano), String(ano + 1)];
  const q = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => { try { return await fn(); } catch { return []; } };
  const membros = await q(() => prisma.membroFerias.findMany({ where: { idPmma, anoGozo: { in: anos } } }));
  const equipes = membros.length
    ? await q(() => prisma.equipeFerias.findMany({
        where: { OR: membros.map((m) => ({ numeroEquipe: m.numeroEquipe, anoGozo: m.anoGozo })) },
      }))
    : [];
  let avulsas: any[] = [];
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
    const v = row?.valor ? JSON.parse(row.valor) : [];
    avulsas = Array.isArray(v) ? v.filter((a: any) => String(a?.idPmma || "") === idPmma) : [];
  } catch {}
  const adiados = await idsFeriasAdiadas().catch(() => new Set<string>());
  const af = montarAfastamentos({
    equipesFerias: equipes as any, membrosFerias: membros as any,
    equipesLicenca: [], membrosLicenca: [], avulsas, adiados,
  });
  return periodoDaExposicao(af, idPmma, hojeISO());
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = decodeURIComponent(params.id);
  const admin = ((session.user as any).perfil || "").toLowerCase() === "admin";
  const meuEfetivo = (session.user as any).refEfetivo as string | null;
  const url = new URL(req.url);

  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });
    if (!admin && r.efetivoId !== meuEfetivo) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    if (!ehPermanenciaArma(r.modalidade)) {
      return NextResponse.json(
        { error: "A exposição de motivos só vale para o requerimento de autorização de permanência de armamento." },
        { status: 400 },
      );
    }

    const assinada = await assinaturaDoRequerente(id);
    if (url.searchParams.get("sugestao")) {
      const plano = await feriasDoMilitar(r.efetivoId);
      return NextResponse.json({
        inicio: plano?.inicio || "", fim: plano?.fim || "",
        possoAssinar: r.efetivoId === meuEfetivo,
        assinatura: assinada ? { id: assinada.id, nome: assinada.nome, em: assinada.em, inicio: assinada.inicio, fim: assinada.fim } : null,
      });
    }

    // assinada: vale o que foi assinado (as datas da tela não mudam o documento)
    let inicio: string, fim: string;
    if (assinada) { inicio = assinada.inicio; fim = assinada.fim; }
    else {
      const plano = (iso(url.searchParams.get("inicio")) && iso(url.searchParams.get("fim"))) ? null : await feriasDoMilitar(r.efetivoId);
      inicio = iso(url.searchParams.get("inicio")) || plano?.inicio || "";
      fim = iso(url.searchParams.get("fim")) || plano?.fim || "";
    }
    let carimbo = null;
    if (assinada) {
      const base = (process.env.NEXTAUTH_URL || url.origin).replace(/\/+$/, "");
      const link = `${base}/verificar/assinatura/${encodeURIComponent(assinada.id)}?t=${encodeURIComponent(assinada.token)}`;
      carimbo = {
        id: assinada.id, nome: assinada.nome, cargo: assinada.cargo, quando: assinada.em,
        qrPng: await QRCode.toBuffer(link, { margin: 1, width: 300, errorCorrectionLevel: "M" }),
      };
    }
    // nome de guerra, barra e ID: do requerimento, e o que faltar, da ficha
    const ficha = await prisma.efetivo.findUnique({
      where: { id: r.efetivoId }, select: { nomeGuerra: true, numeroBarra: true, matricula: true },
    }).catch(() => null);
    const buffer = gerarExposicaoArmaDocx({
      postoGrad: r.postoGrad, nomeCompleto: r.nomeCompleto,
      matricula: r.matricula || ficha?.matricula || "",
      nomeGuerra: ficha?.nomeGuerra || "",
      numeroBarra: r.numeroPm || ficha?.numeroBarra || "",
      idPmma: r.idPmmaTxt || r.efetivoId,
      inicio, fim, carimbo,
    });

    try {
      await registrar({
        acao: "gerar_exposicao_arma", alvo: id, alvoNome: r.modalidade,
        detalhe: `Exposição de motivos gerada (férias ${brData(inicio)} a ${brData(fim)})${assinada ? ` — assinada ${assinada.id}` : ""}`,
      });
    } catch {}

    const nomeArquivo = nomeDocumento("Exposição de Motivos", await militarDoEfetivo(r.efetivoId, { postoGrad: r.postoGrad, nome: r.nomeCompleto }));
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": disposicaoArquivo(nomeArquivo, "docx"),
      },
    });
  } catch (err) {
    console.error("[GET /api/requerimentos/[id]/exposicao]", err);
    return NextResponse.json({ error: "Falha ao gerar a exposição de motivos" }, { status: 500 });
  }
}

/* O REQUERENTE assina a exposição no SIGEP, confirmando com a senha (como no
   memorando de férias). Só o dono do requerimento: o admin não assina por ele. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.login) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = decodeURIComponent(params.id);
  try {
    const r = await prisma.requerimento.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Requerimento nao encontrado" }, { status: 404 });
    if (!ehPermanenciaArma(r.modalidade)) {
      return NextResponse.json({ error: "Só o requerimento de permanência de armamento tem exposição de motivos." }, { status: 400 });
    }
    if (r.efetivoId !== u.refEfetivo) {
      return NextResponse.json({ error: "Só o próprio requerente assina a exposição de motivos." }, { status: 403 });
    }
    const b = await req.json().catch(() => ({}));
    const inicio = iso(b?.inicio), fim = iso(b?.fim);
    if (!inicio || !fim) return NextResponse.json({ error: "Informe o início e o último dia das férias para assinar." }, { status: 400 });
    if (fim < inicio) return NextResponse.json({ error: "O último dia das férias é antes do início." }, { status: 400 });

    const usuario = await prisma.usuario.findFirst({ where: { login: { equals: String(u.login), mode: "insensitive" } } });
    const senhaOk = !!usuario?.senhaHash && (await conferirSenha(String(b?.senha || ""), usuario.senhaHash, usuario.salt)).ok;
    if (!senhaOk) return NextResponse.json({ error: "Senha incorreta — confirme sua senha para assinar." }, { status: 401 });

    const nome = [r.postoGrad, r.nomeCompleto].filter(Boolean).join(" ").trim() || String(u.name || "");
    const [criada] = await criarAssinaturas(
      [{ tipo: TIPO, ref: id, conteudo: conteudo(r, inicio, fim), resumo: `Permanência com armamento nas férias · ${brData(inicio)} a ${brData(fim)}` }],
      { papel: "militar", nome, cargo: "Militar interessado", efetivoId: r.efetivoId, ...origemDaRequisicao(req) },
    );
    const periodos = await lerPeriodos();
    periodos[id] = { inicio, fim };
    const valor = JSON.stringify(periodos);
    await prisma.config.upsert({
      where: { chave: CHAVE_PERIODOS }, update: { valor },
      create: { chave: CHAVE_PERIODOS, valor, descricao: "Exposição de motivos (arma nas férias): datas assinadas por requerimento" },
    });
    try {
      await registrar({ acao: "assinar_exposicao_arma", alvo: id, alvoNome: nome, detalhe: `Exposição de motivos assinada no SIGEP (${criada.id}) — férias ${brData(inicio)} a ${brData(fim)}` });
    } catch {}
    return NextResponse.json({ ok: true, id: criada.id, em: criada.em });
  } catch (err) {
    console.error("[POST /api/requerimentos/[id]/exposicao]", err);
    return NextResponse.json({ error: "Falha ao assinar" }, { status: 500 });
  }
}
