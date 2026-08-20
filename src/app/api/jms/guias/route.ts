import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/* /api/jms/guias
   Registro das GUIAS DE ENCAMINHAMENTO MÉDICO emitidas.

   A guia tem numeracao PROPRIA e sequencial por ano (027/2026, 028/2026...).
   Ao contrario do memorando de ferias — cujo numero e derivado da posicao no
   plano — aqui o numero e GRAVADO junto com a guia no momento em que ela e
   registrada, e nunca mais recalculado: reimprimir meses depois sai com o
   mesmo numero do original protocolado, e apagar uma guia nao devolve o numero
   dela para a fila.

   O OFICIO nao passa por aqui de proposito: a numeracao dele e manual, porque
   ha outros setores alem do SIGEP emitindo oficios na mesma serie.

   PONTO DE PARTIDA: o Batalhao ja emitia guia no papel antes do sistema, e a
   serie do ano nao recomeca por causa disso. Entao o admin informa qual foi a
   ULTIMA guia emitida fora do sistema (ex.: 028 de 2026) e o proximo numero
   passa a sair dali em diante (029). Fica guardado por ANO: 2027 comeca
   limpo, a nao ser que o admin diga outra coisa.

   GET ?ano=2026 -> { guias, proximo, ultimaForaDoSistema }
   POST          -> registra a guia e devolve o numero
   PUT  { ano, ultimaForaDoSistema } -> ajusta o ponto de partida do ano */
const CHAVE = "jms_guias";
const CHAVE_INICIO = "jms_guias_inicio";

type Guia = {
  id: string; numero: number; ano: string;
  idPmma: string; nome: string; dataVisita: string; criadoEm: string;
};

function ehAdmin(perfil?: string | null): boolean {
  return (perfil || "").toLowerCase() === "admin";
}

function ler(v?: string | null): Guia[] {
  try { const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

/* { "2026": 28 } = a ultima guia emitida FORA do sistema naquele ano. */
type Inicios = Record<string, number>;
async function lerInicios(): Promise<Inicios> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_INICIO } });
    const v = row?.valor ? JSON.parse(row.valor) : {};
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
async function salvarInicios(v: Inicios) {
  await prisma.config.upsert({
    where: { chave: CHAVE_INICIO },
    update: { valor: JSON.stringify(v) },
    create: { chave: CHAVE_INICIO, valor: JSON.stringify(v), descricao: "Ultima guia JMS emitida fora do sistema, por ano" },
  });
}

async function salvar(lista: Guia[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(lista) },
    create: { chave: CHAVE, valor: JSON.stringify(lista), descricao: "Guias de encaminhamento medico emitidas" },
  });
}

/* Proximo numero do ano = o maior entre o que o sistema ja emitiu e o que foi
   emitido no papel, mais um. Nunca reaproveita numero de guia apagada, e
   nunca volta atras do ponto de partida informado pelo admin. */
function proximoNumero(lista: Guia[], ano: string, inicio = 0): number {
  let maior = inicio;
  for (const g of lista) {
    if (g.ano === ano && typeof g.numero === "number" && g.numero > maior) maior = g.numero;
  }
  return maior + 1;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const ano = new URL(req.url).searchParams.get("ano") || String(new Date().getFullYear());
  const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
  const inicios = await lerInicios();
  const doAno = lista.filter((g) => g.ano === ano).sort((a, b) => b.numero - a.numero);
  return NextResponse.json({
    guias: doAno,
    proximo: proximoNumero(lista, ano, inicios[ano] || 0),
    ultimaForaDoSistema: inicios[ano] || 0,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const idPmma = String(b?.idPmma || "").trim();
    const ano = String(b?.ano || "").trim();
    if (!idPmma) return NextResponse.json({ error: "idPmma obrigatorio" }, { status: 400 });
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "ano obrigatorio (AAAA)" }, { status: 400 });

    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const inicios = await lerInicios();
    const guia: Guia = {
      id: crypto.randomUUID(),
      numero: proximoNumero(lista, ano, inicios[ano] || 0),
      ano,
      idPmma,
      nome: String(b?.nome || "").trim(),
      dataVisita: String(b?.dataVisita || "").trim(),
      criadoEm: new Date().toISOString().slice(0, 10),
    };
    lista.push(guia);
    await salvar(lista);
    return NextResponse.json({ ok: true, guia, proximo: proximoNumero(lista, ano, inicios[ano] || 0) });
  } catch (err) {
    console.error("[POST /api/jms/guias]", err);
    return NextResponse.json({ error: "Falha ao registrar a guia" }, { status: 500 });
  }
}

/* PUT { ano, ultimaForaDoSistema }
   Ajusta de onde a numeracao do ano continua. Informar 28 faz a proxima guia
   sair 029. Nao apaga nem renumera guia nenhuma ja registrada — so move o
   piso. Por isso recusa um piso ABAIXO do que o sistema ja emitiu: baixar ali
   faria a proxima guia repetir um numero que ja saiu no papel assinado. */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!ehAdmin((session.user as any).perfil)) return NextResponse.json({ error: "Apenas o admin" }, { status: 403 });
  try {
    const b = await req.json();
    const ano = String(b?.ano || "").trim();
    if (!/^\d{4}$/.test(ano)) return NextResponse.json({ error: "Informe o ano (AAAA)." }, { status: 400 });

    const n = Number(b?.ultimaForaDoSistema);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      return NextResponse.json({ error: "Informe um número entre 0 e 9999." }, { status: 400 });
    }
    const valor = Math.floor(n);

    const lista = ler((await prisma.config.findUnique({ where: { chave: CHAVE } }))?.valor);
    const maiorEmitido = lista
      .filter((g) => g.ano === ano)
      .reduce((m, g) => (g.numero > m ? g.numero : m), 0);
    if (valor < maiorEmitido) {
      return NextResponse.json(
        { error: `O sistema já emitiu a guia ${String(maiorEmitido).padStart(3, "0")}/${ano}. O ponto de partida não pode ser menor que isso.` },
        { status: 400 }
      );
    }

    const inicios = await lerInicios();
    inicios[ano] = valor;
    await salvarInicios(inicios);
    return NextResponse.json({ ok: true, ano, ultimaForaDoSistema: valor, proximo: proximoNumero(lista, ano, valor) });
  } catch (err) {
    console.error("[PUT /api/jms/guias]", err);
    return NextResponse.json({ error: "Falha ao salvar o ponto de partida" }, { status: 500 });
  }
}
