import { prisma } from "@/lib/prisma";
import { cifrar, decifrar } from "@/lib/cripto";

/* =========================================================================
   REQUERIMENTO DE PREMIAÇÃO PECUNIÁRIA — GUARDADO NO BANCO

   Até agora este requerimento era montado na tela e impresso; nada ficava.
   Isso bastava enquanto era só papel, mas não basta para ASSINAR.

   Assinatura é um lacre sobre um conteúdo: para dizer "fulano assinou ISTO",
   o "isto" precisa existir em algum lugar estável, com um número, para poder
   ser reaberto e conferido depois. Documento que só existe na aba aberta do
   navegador não tem como ser assinado — o lacre não teria sobre o que cair.

   Tabela criada em runtime, como o histórico e as assinaturas: o deploy não
   roda `db push` (ver README), então tabela declarada só no schema.prisma não
   existiria em produção.

   O conteúdo inteiro vai em JSON numa coluna. É um documento — texto,
   destinatário, local, data e a lista de policiais —, não um cadastro com
   campos de formato fixo; e a lista de policiais do requerimento não é
   consultada por fora, só junto com o documento.
   ========================================================================= */

export type LinhaPecunia = {
  chave: string;          // identidade da linha na tela
  efetivoId: string;      // vazio = digitado à mão (policial civil, ou de fora)
  cargo: string;
  nome: string;
  matricula: string;
  idPmma: string;
  lotacao: string;
  banco: string;
  /* Deixa o espaço da assinatura EM BRANCO no papel, porque o policial vai
     assinar o PDF pelo Gov.br depois de imprimir. Não afirma que ele assinou:
     é só o sistema saindo da frente. */
  assinarGov?: boolean;
};

export type DadosPecunia = {
  destinatario: string;
  texto: string;
  local: string;
  data: string;
  linhas: LinhaPecunia[];
};

export type RequerimentoPecunia = {
  id: string;             // "RP-2026-000001"
  criadoPor: string;      // login de quem montou
  criadoPorNome: string;
  criadoEm: string;       // ISO
  atualizadoEm: string;   // ISO
  dados: DadosPecunia;
};

export const TIPO_ASSINATURA = "requerimento_pecunia";

/* "|111|222|" — com as barras nas pontas, um LIKE '%|22|%' não confunde o
   policial 22 com o 221. Lista vazia vira "|", que é diferente de "" e
   significa "já calculado, não tem ninguém do efetivo". */
export function marcaEfetivos(ids: (string | undefined)[]): string {
  const limpos = Array.from(new Set(ids.map((x) => String(x || "").trim()).filter(Boolean)));
  return limpos.length ? `|${limpos.join("|")}|` : "|";
}

let pronto: Promise<void> | null = null;

function garantir(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS requerimento_pecunia (
          id text PRIMARY KEY,
          criado_por text NOT NULL DEFAULT '',
          criado_por_nome text NOT NULL DEFAULT '',
          criado_em text NOT NULL DEFAULT '',
          atualizado_em text NOT NULL DEFAULT '',
          dados text NOT NULL DEFAULT '{}'
        )`);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_requerimento_pecunia_criado ON requerimento_pecunia (criado_em)`);
      /* Quem está no requerimento, repetido FORA do JSON: "|111|222|".

         O sino pergunta "há requerimento esperando a minha assinatura?" a cada
         pulso, de cada usuário logado. Responder isso lendo o JSON de todas as
         linhas e decifrando os dados bancários de todo mundo — para no fim
         olhar só uma lista de IDs — seria caro e desnecessário. Com a coluna,
         a pergunta vira um LIKE e o JSON só é aberto no requerimento que
         interessa. */
      await prisma.$executeRawUnsafe(
        `ALTER TABLE requerimento_pecunia ADD COLUMN IF NOT EXISTS efetivos text NOT NULL DEFAULT ''`);
      /* O contador é o mesmo do disciplinar e das assinaturas. Criado aqui
         também porque esta rota pode ser a primeira a rodar num banco novo. */
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS disciplinar_contador (
          chave text PRIMARY KEY,
          valor integer NOT NULL DEFAULT 0
        )`);
      /* Requerimento guardado antes desta coluna existir tem efetivos = ''
         (nunca calculado) — e ficaria invisível para o sino. Recalcula uma
         vez. Um requerimento só de civis fica com "|", que é diferente de
         vazio: assim não volta a ser recalculado a cada reinício. */
      try {
        const velhos: any[] = await prisma.$queryRawUnsafe(
          `SELECT id, dados FROM requerimento_pecunia WHERE efetivos = '' LIMIT 500`);
        for (const v of velhos) {
          let ids: string[] = [];
          try { ids = (JSON.parse(v.dados || "{}")?.linhas || []).map((l: any) => String(l?.efetivoId || "")); }
          catch { /* JSON estragado: fica com a marca vazia mesmo */ }
          await prisma.$executeRawUnsafe(
            `UPDATE requerimento_pecunia SET efetivos = $2 WHERE id = $1`, v.id, marcaEfetivos(ids));
        }
      } catch (e) { console.error("[requerimentoPecunia] backfill efetivos", e); }
    })().catch((e) => {
      pronto = null; // não deixa o erro grudado: a próxima chamada tenta de novo
      throw e;
    });
  }
  return pronto;
}

async function proximoNumero(): Promise<string> {
  const ano = new Date().getFullYear();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `INSERT INTO disciplinar_contador (chave, valor) VALUES ($1, 1)
     ON CONFLICT (chave) DO UPDATE SET valor = disciplinar_contador.valor + 1 RETURNING valor`,
    `requerimento_pecunia_${ano}`);
  const seq = Number(rows[0]?.valor ?? 1);
  return `RP-${ano}-${String(seq).padStart(6, "0")}`;
}

/* Normaliza o que veio da tela. Tudo vira string do tamanho certo antes de
   entrar no banco — o que é assinado depois sai DAQUI, então o conteúdo
   precisa ser previsível. */
function limpar(d: any): DadosPecunia {
  const t = (v: any, n = 200) => String(v ?? "").slice(0, n);
  const linhas: LinhaPecunia[] = (Array.isArray(d?.linhas) ? d.linhas : [])
    .slice(0, 60)
    .map((l: any, i: number) => ({
      chave: t(l?.chave || `m-${i}`, 60),
      efetivoId: t(l?.efetivoId, 60),
      cargo: t(l?.cargo, 60),
      nome: t(l?.nome, 120),
      matricula: t(l?.matricula, 30),
      idPmma: t(l?.idPmma, 30),
      lotacao: t(l?.lotacao, 60),
      banco: t(l?.banco, 120),
      assinarGov: !!l?.assinarGov,
    }));
  return {
    destinatario: t(d?.destinatario, 300),
    texto: t(d?.texto, 4000),
    local: t(d?.local, 120),
    data: t(d?.data, 40),
    linhas,
  };
}

/* ---------------------------------------------------------------------------
   DADOS BANCÁRIOS CIFRADOS EM REPOUSO, também aqui.

   Na ficha do policial, banco/agência/conta são guardados cifrados — é uma
   decisão do sistema, não um detalhe. A coluna DADOS BANCÁRIOS deste
   requerimento carrega exatamente a mesma informação; deixá-la em texto puro
   nesta tabela desfaria a proteção pelo caminho de trás, e com o agravante de
   reunir a conta de várias pessoas numa linha só.

   Cifrado só na coluna do banco: o resto do sistema (inclusive o que é
   assinado) trabalha sempre com o valor já decifrado, porque a leitura passa
   obrigatoriamente por aqui.
   --------------------------------------------------------------------------- */
const comBancoCifrado = (d: DadosPecunia): DadosPecunia => ({
  ...d, linhas: d.linhas.map((l) => ({ ...l, banco: String(cifrar(l.banco) ?? "") })),
});
const comBancoAberto = (d: any) => ({
  ...d, linhas: (Array.isArray(d?.linhas) ? d.linhas : []).map((l: any) => ({ ...l, banco: String(decifrar(l?.banco) ?? "") })),
});

function mapear(r: any): RequerimentoPecunia {
  let dados: DadosPecunia;
  try { dados = limpar(comBancoAberto(JSON.parse(r.dados || "{}"))); }
  catch { dados = limpar({}); }
  return {
    id: r.id,
    criadoPor: r.criado_por || "",
    criadoPorNome: r.criado_por_nome || "",
    criadoEm: r.criado_em || "",
    atualizadoEm: r.atualizado_em || "",
    dados,
  };
}

export async function criarPecunia(
  dados: unknown, por: string, porNome: string,
): Promise<RequerimentoPecunia> {
  await garantir();
  const id = await proximoNumero();
  const agora = new Date().toISOString();
  const limpos = limpar(dados);
  await prisma.$executeRawUnsafe(
    `INSERT INTO requerimento_pecunia (id, criado_por, criado_por_nome, criado_em, atualizado_em, dados, efetivos)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    id, por, porNome, agora, agora, JSON.stringify(comBancoCifrado(limpos)),
    marcaEfetivos(limpos.linhas.map((l) => l.efetivoId)));
  return { id, criadoPor: por, criadoPorNome: porNome, criadoEm: agora, atualizadoEm: agora, dados: limpos };
}

export async function salvarPecunia(id: string, dados: unknown): Promise<boolean> {
  await garantir();
  const limpos = limpar(dados);
  const n = await prisma.$executeRawUnsafe(
    `UPDATE requerimento_pecunia SET dados=$2, atualizado_em=$3, efetivos=$4 WHERE id=$1`,
    id, JSON.stringify(comBancoCifrado(limpos)), new Date().toISOString(),
    marcaEfetivos(limpos.linhas.map((l) => l.efetivoId)));
  return Number(n) > 0;
}

export async function lerPecunia(id: string): Promise<RequerimentoPecunia | null> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM requerimento_pecunia WHERE id=$1 LIMIT 1`, id);
  return rows[0] ? mapear(rows[0]) : null;
}

export async function listarPecunia(limite = 200): Promise<RequerimentoPecunia[]> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM requerimento_pecunia ORDER BY criado_em DESC LIMIT ${Math.max(1, Math.min(500, limite))}`);
  return rows.map(mapear);
}

/* Marca (ou desmarca) a linha de UM policial como "vai assinar pelo Gov.br".

   Gravado à parte do salvarPecunia de propósito: isto NÃO é conteúdo do
   documento, é a escolha de como cada um vai assinar. Por isso não entra no
   conteudoAssinavel e por isso não esbarra na trava de edição — o policial
   pode decidir assinar pelo Gov.br mesmo depois de outro colega já ter
   assinado, sem derrubar a assinatura de ninguém. */
export async function marcarGov(id: string, efetivoId: string, valor: boolean): Promise<RequerimentoPecunia | null> {
  const r = await lerPecunia(id);
  if (!r) return null;
  const linhas = r.dados.linhas.map((l) => (l.efetivoId === efetivoId ? { ...l, assinarGov: valor } : l));
  await prisma.$executeRawUnsafe(
    `UPDATE requerimento_pecunia SET dados=$2, atualizado_em=$3 WHERE id=$1`,
    id, JSON.stringify(comBancoCifrado({ ...r.dados, linhas })), new Date().toISOString());
  return { ...r, dados: { ...r.dados, linhas } };
}

/* Os requerimentos em que ESTE policial está — sem abrir o JSON de nenhum.
   É o que o sino e a tela de requerimentos perguntam. */
export type ResumoPecunia = { id: string; criadoPor: string; criadoPorNome: string; criadoEm: string };

export async function envolvemEfetivo(efetivoId: string): Promise<ResumoPecunia[]> {
  const alvo = String(efetivoId || "").trim();
  // Um id com curinga de LIKE viraria uma busca aberta; nenhum ID PMMA tem isso.
  if (!alvo || /[%_|\\]/.test(alvo)) return [];
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, criado_por, criado_por_nome, criado_em FROM requerimento_pecunia
      WHERE efetivos LIKE $1 ORDER BY criado_em DESC LIMIT 100`, `%|${alvo}|%`);
  return rows.map((r) => ({
    id: r.id, criadoPor: r.criado_por || "", criadoPorNome: r.criado_por_nome || "", criadoEm: r.criado_em || "",
  }));
}

export async function apagarPecunia(id: string): Promise<void> {
  await garantir();
  await prisma.$executeRawUnsafe(`DELETE FROM requerimento_pecunia WHERE id=$1`, id);
}

/* Quem enxerga o requerimento: quem montou, quem está NELE, e o P/1. Um
   policial não tem por que ver o pedido de um grupo do qual não participou —
   ali estão os dados bancários de todo mundo.

   Quem ESTÁ no requerimento vê a tabela inteira, dados bancários dos colegas
   inclusive. Isso é do documento, não uma folga da regra: é uma folha só, que
   todos assinam, e no papel cada signatário lê a mesma tabela. A regra
   estreita da /ficha continua valendo onde importa — ninguém puxa a conta de
   um colega qualquer por ID; só enxerga quem já divide o mesmo pedido, e quem
   pôs os dados ali foi o P/1. */
export function podeVer(r: RequerimentoPecunia, login: string, efetivoId: string | null, admin: boolean): boolean {
  if (admin) return true;
  if (login && r.criadoPor === login) return true;
  return !!efetivoId && r.dados.linhas.some((l) => l.efetivoId === efetivoId);
}

/* ---------------------------------------------------------------------------
   O CONTEÚDO QUE A ASSINATURA LACRA.

   Montado AQUI, no servidor, a partir do que está guardado — nunca a partir do
   que o navegador mandou. Nas escalas o conteúdo assinado vem da tela porque a
   escala é gerada ali na hora; aqui o documento já está no banco, então deixar
   o cliente dizer o que está assinando seria abrir mão da única coisa que a
   assinatura garante.

   Lacra o requerimento INTEIRO, e não só a linha do assinante: cada policial
   assina o pedido completo, com quem mais está nele e com que dados. Se
   qualquer linha mudar depois, todas as assinaturas passam a divergir — que é
   exatamente o que se espera de um documento assinado.
   --------------------------------------------------------------------------- */
export function conteudoAssinavel(r: RequerimentoPecunia): string {
  const linhas = r.dados.linhas.map((l, i) =>
    [i + 1, l.cargo, l.nome, l.matricula, l.idPmma, l.lotacao, l.banco].join("|"));
  return [
    `REQUERIMENTO PREMIACAO PECUNIARIA ${r.id}`,
    r.dados.destinatario,
    r.dados.texto,
    `${r.dados.local}, ${r.dados.data}`,
    ...linhas,
  ].join("\n");
}

export function resumoAssinatura(r: RequerimentoPecunia): string {
  const n = r.dados.linhas.length;
  return `Requerimento de premiação pecuniária ${r.id} — ${n} policial(is)`;
}

// Referência da assinatura de um policial dentro do requerimento.
export const refAssinatura = (reqId: string, efetivoId: string) => `${reqId}:${efetivoId}`;
