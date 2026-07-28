import { prisma } from "@/lib/prisma";
import { podeComoEncargo, podeVerP1 } from "@/lib/encargos";

/* =========================================================================
   SOLICITAÇÃO DE PERMUTA — documento iniciado pelo policial, ANTES da escala.

   Fluxo (baseado no formulário oficial do 18º BPM):
     1) solicitante preenche: colega (solicitado), data da permuta, data de
        retorno e motivo. Ao enviar, ele "assina" pelo próprio login
        (a senha individual = assinatura; dela saem posto/grad, nº e nome de
        guerra).  -> estado "aguardando_solicitado"
     2) o solicitado recebe o alerta, abre e assina o "concordo" (ou recusa).
        -> "aguardando_p1" (ou "recusada")
     3) o P/1 dá o parecer e o Subcomandante o visto: Autorizado / Não
        Autorizado. -> "autorizada" / "nao_autorizada"

   Guardado na tabela Config (chave "permuta_pedidos"), sem alterar o schema.
   ========================================================================= */

const CHAVE_PEDIDOS = "permuta_pedidos";

export type EstadoPermuta =
  | "aguardando_solicitado"
  | "recusada"
  | "aguardando_p1"       // aguarda o PARECER do Chefe do P/1 (Silas)
  | "aguardando_subcmt"   // com parecer; aguarda o VISTO do Subcmt (Frans)
  | "autorizada"
  | "nao_autorizada"
  | "cancelada";

export type Assinatura = {
  efetivoId: string;
  nome: string;    // nome completo
  linha: string;   // "Sd PM 338/22 Danielle" (posto + PM + nº/barra + guerra)
  em: string;      // ISO da assinatura
};

export type Ciencia = { em: string; ip: string | null } | null;
export type Permuta = {
  id: string;
  protocolo?: string;             // PER-2026-000245 (nº de controle)
  cienciaSolicitante?: Ciencia;   // termo de ciência da decisão (LGPD/auditoria)
  cienciaSolicitado?: Ciencia;
  solicitanteId: string;
  solicitante: Assinatura;
  solicitadoId: string;
  solicitadoNome: string;         // nome de exibição do colega (linha)
  solicitado: Assinatura | null;  // preenchida quando ele assina
  dataPermuta: string;            // ISO aaaa-mm-dd
  dataRetorno: string;            // ISO aaaa-mm-dd
  motivo: string;
  estado: EstadoPermuta;
  parecerP1: string | null;
  p1Favoravel: boolean | null;  // sentido do parecer do Chefe do P/1 (favorável/não)
  p1Nome: string | null;
  p1Cargo: string | null;   // cargo de quem deu o parecer (ex.: "Aux. da Seção P/1-18º BPM")
  p1Em: string | null;
  visto: "autorizado" | "nao_autorizado" | null;
  subcmtNome: string | null;  // quem deu o visto (Subcmt)
  subcmtEm: string | null;
  criadoEm: string;
  // controle do "amarrar na escala": vira true quando o substituto ja foi
  // lancado na escala daquele dia (aplicado UMA vez; depois o admin pode
  // editar/excluir livremente sem que o sistema jogue de novo).
  aplicadaPermuta?: boolean;   // dia da permuta (solicitado cobre o solicitante)
  aplicadaRetorno?: boolean;   // dia do retorno (solicitante cobre o solicitado)
  verifToken?: string;         // token de verificação (QR) — derivado, não persistido
  // Quem deve dar o PARECER: depende do lugar do SOLICITADO (quem tem o serviço
  // coberto). Sede -> "chefe_p1"; CIA/pelotão -> "cmt_<noId>". Sem isto = P/1.
  pareceristaEncargo?: string; // "chefe_p1" | "cmt_2cia" ...
  pareceristaRotulo?: string;  // ex.: "Chefe do P/1" | "Cmt — 2ª CIA"
};

// Abrevia posto/graduação no padrão dos documentos do batalhão.
export function abrevPosto(posto: string): string {
  const p = (posto || "").trim().toLowerCase();
  const mapa: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "tenente coronel": "Ten Cel",
    "major": "Maj", "capitão": "Cap", "capitao": "Cap",
    "1º tenente": "1º Ten", "1° tenente": "1º Ten", "primeiro tenente": "1º Ten",
    "2º tenente": "2º Ten", "2° tenente": "2º Ten", "segundo tenente": "2º Ten",
    "aspirante a oficial": "Asp Of", "aspirante": "Asp Of", "subtenente": "ST",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt",
    "cabo": "Cb", "soldado": "Sd",
  };
  return mapa[p] ?? (posto || "").trim();
}

export type FichaMin = {
  id: string;
  postoGrad: string | null;
  numeroBarra: string | null;
  nome: string | null;
  nomeGuerra: string | null;
};

// Monta a "linha" de assinatura/identificação: "Sd PM 338/22 Danielle".
export function linhaMilitar(f: FichaMin): string {
  const posto = abrevPosto(f.postoGrad || "");
  const barra = (f.numeroBarra || "").trim();
  const guerra = (f.nomeGuerra || (f.nome || "").split(/\s+/).slice(-1)[0] || "").trim();
  return [posto, "PM", barra, guerra].filter(Boolean).join(" ").trim();
}

/* Auxiliares da Seção P/1: quando um deles dá o parecer, o documento mostra
   "Aux. da Seção P/1-18º BPM" antes do nome. Lista temporária por nome (o
   admin definirá as atribuições formalmente depois). Edite aqui se mudar. */
const AUX_P1_FRAGMENTOS = ["elvys", "elyana", "elyanna", "moraes"];

export function cargoP1(nomeAprovador: string | null | undefined): string | null {
  const n = (nomeAprovador || "").toLowerCase();
  if (AUX_P1_FRAGMENTOS.some((f) => n.includes(f))) return "Aux. da Seção P/1-18º BPM";
  return null;
}

export async function fichaDe(efetivoId: string): Promise<FichaMin | null> {
  return prisma.efetivo.findUnique({
    where: { id: efetivoId },
    select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true },
  });
}

/* TABELA PRÓPRIA (uma linha por permuta), no lugar do array JSON num único
   Config. Motivo: cada permuta é gravada isoladamente (upsertPermuta), então
   dois admins agindo em permutas diferentes não se sobrescrevem. Criada em
   runtime (o deploy não roda db push) e o Config antigo é migrado 1x. O objeto
   completo fica na coluna `dados` (nenhum campo se perde); as colunas soltas são
   só para índice/consulta. */
const FLAG_MIGRADO_PERM = "permuta_pedidos_migrado_tabela";
let prontoPerm: Promise<void> | null = null;
function garantirPerm(): Promise<void> {
  if (!prontoPerm) prontoPerm = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS permuta (
        id text PRIMARY KEY,
        estado text NOT NULL DEFAULT '',
        solicitante_id text NOT NULL DEFAULT '',
        solicitado_id text NOT NULL DEFAULT '',
        criado_em text NOT NULL DEFAULT '',
        dados text NOT NULL DEFAULT '{}'
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_permuta_estado ON permuta (estado)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_permuta_solicitante ON permuta (solicitante_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_permuta_solicitado ON permuta (solicitado_id)`);
    // Migração única do Config antigo (idempotente: ON CONFLICT DO NOTHING).
    try {
      const flag = await prisma.config.findUnique({ where: { chave: FLAG_MIGRADO_PERM } });
      if (!flag) {
        const row = await prisma.config.findUnique({ where: { chave: CHAVE_PEDIDOS } });
        const antigas: Permuta[] = row?.valor ? (JSON.parse(row.valor) || []) : [];
        for (const p of antigas) {
          if (!p?.id) continue;
          await prisma.$executeRawUnsafe(
            `INSERT INTO permuta (id, estado, solicitante_id, solicitado_id, criado_em, dados)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            p.id, p.estado || "", p.solicitanteId || "", p.solicitadoId || "", p.criadoEm || "", JSON.stringify(p));
        }
        await prisma.config.upsert({ where: { chave: FLAG_MIGRADO_PERM }, update: { valor: "1" }, create: { chave: FLAG_MIGRADO_PERM, valor: "1", descricao: "Permutas migradas para tabela" } });
      }
    } catch (e) { console.error("[permutaPedidos] migracao", e); }
  })();
  return prontoPerm;
}

export async function lerPermutas(): Promise<Permuta[]> {
  try {
    await garantirPerm();
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT dados FROM permuta ORDER BY criado_em ASC`);
    const out: Permuta[] = [];
    for (const r of rows) { try { out.push(JSON.parse(r.dados) as Permuta); } catch { /* ignora linha corrompida */ } }
    return out;
  } catch {
    return [];
  }
}

// Grava UMA permuta (add ou atualização). É o caminho normal de escrita.
export async function upsertPermuta(p: Permuta): Promise<void> {
  await garantirPerm();
  await prisma.$executeRawUnsafe(
    `INSERT INTO permuta (id, estado, solicitante_id, solicitado_id, criado_em, dados)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET estado=$2, solicitante_id=$3, solicitado_id=$4, criado_em=$5, dados=$6`,
    p.id, p.estado || "", p.solicitanteId || "", p.solicitadoId || "", p.criadoEm || "", JSON.stringify(p));
}

/* Compat: grava uma lista (upsert de cada item). Não apaga nenhuma permuta —
   no fluxo elas nunca são removidas (cancelar só muda o estado). */
export async function salvarPermutas(pedidos: Permuta[]): Promise<void> {
  await garantirPerm();
  for (const p of pedidos) { if (p?.id) await upsertPermuta(p); }
}

/* -------------------------------------------------------------------------
   Amarrar na escala: quando uma permuta e AUTORIZADA, o substituto entra na
   vaga da escala daquele dia. Como a permuta pode ser decidida ANTES da escala
   existir, isto tambem roda quando a escala e aberta (GET /api/escala-dias):
   aplica as permutas autorizadas ainda nao lancadas. Aplica UMA vez por lado
   (flags aplicadaPermuta/aplicadaRetorno), preservando a liberdade do admin de
   editar/excluir depois sem o sistema jogar de novo.
   ------------------------------------------------------------------------- */
const CHAVE_ESCALA = "escala_dias";

const CAMPOS_ESCALA: { campo: string; lista: boolean }[] = [
  { campo: "cpuDeDia", lista: false },
  { campo: "rpAdjunto", lista: false },
  { campo: "rpMotorista", lista: false },
  { campo: "rpPatrulheiro", lista: true },
  { campo: "ftGraduado", lista: false },
  { campo: "ftMotorista", lista: false },
  { campo: "ftPatrulheiro", lista: true },
  { campo: "guardaPermanente", lista: true },
  { campo: "inteligencia", lista: true },
  { campo: "rotemMilitares", lista: true },
];

type SlotEsc = { titular?: string; permuta?: string | null; status?: string | null };

function semTags(html: string): string {
  return String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

// A vaga e do militar? Compara o texto do titular com nome de guerra / nº de
// barra / matricula (cobre os formatos usados na escala).
function titularEhDoMilitar(titular: string, f: FichaMin & { matricula?: string | null }): boolean {
  const alvo = semTags(titular).toLowerCase();
  if (!alvo) return false;
  const cands: string[] = [];
  if (f.nomeGuerra) cands.push(f.nomeGuerra);
  if (f.numeroBarra) cands.push(f.numeroBarra);
  if ((f as any).matricula) cands.push((f as any).matricula);
  if (!f.nomeGuerra && f.nome) {
    const p = f.nome.trim().split(/\s+/);
    if (p[0]) cands.push(p[0]);
    if (p.length > 1) cands.push(p[p.length - 1]);
  }
  return cands.some((c) => { const t = String(c).trim().toLowerCase(); return t.length >= 3 && alvo.includes(t); });
}

async function lerEscalaDias(): Promise<Record<string, any>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_ESCALA } });
    const o = row?.valor ? JSON.parse(row.valor) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

// Lanca o substituto na 1a vaga do dia cujo titular seja o militar e que ainda
// nao tenha permuta. Devolve true se lancou.
function lancarNoDia(dia: any, ficha: FichaMin, substituto: string): boolean {
  if (!dia || typeof dia !== "object") return false;
  for (const { campo, lista } of CAMPOS_ESCALA) {
    const val = dia[campo];
    const arr: SlotEsc[] = lista
      ? (Array.isArray(val) ? val : (val && typeof val === "object" ? [val] : []))
      : (val && typeof val === "object" ? [val] : []);
    for (const sl of arr) {
      if (sl && titularEhDoMilitar(sl.titular || "", ficha) && !(sl.permuta && String(sl.permuta).trim())) {
        sl.permuta = substituto;
        sl.status = "aprovada";
        return true;
      }
    }
  }
  return false;
}

export async function aplicarPermutasNaEscala(): Promise<void> {
  const pedidos = await lerPermutas();
  const pend = pedidos.filter((p) => p.estado === "autorizada" && (!p.aplicadaPermuta || !p.aplicadaRetorno));
  if (pend.length === 0) return;

  const escalas = await lerEscalaDias();
  let mudouEscala = false;
  const mudadas: Permuta[] = [];

  for (const p of pend) {
    let mudou = false;
    // dia da permuta: o SOLICITADO cobre o SOLICITANTE
    if (!p.aplicadaPermuta && escalas[p.dataPermuta]) {
      const f = await fichaDe(p.solicitanteId);
      if (f && lancarNoDia(escalas[p.dataPermuta], f, p.solicitado?.linha || p.solicitadoNome)) {
        p.aplicadaPermuta = true; mudouEscala = true; mudou = true;
      }
    }
    // dia do retorno: o SOLICITANTE cobre o SOLICITADO
    if (!p.aplicadaRetorno && escalas[p.dataRetorno]) {
      const f = await fichaDe(p.solicitadoId);
      if (f && lancarNoDia(escalas[p.dataRetorno], f, p.solicitante.linha)) {
        p.aplicadaRetorno = true; mudouEscala = true; mudou = true;
      }
    }
    if (mudou) mudadas.push(p);
  }

  if (mudouEscala) {
    await prisma.config.upsert({
      where: { chave: CHAVE_ESCALA },
      update: { valor: JSON.stringify(escalas) },
      create: { chave: CHAVE_ESCALA, valor: JSON.stringify(escalas), descricao: "Dias gerados/editados da Escala de Servico" },
    });
  }
  // grava só as permutas que mudaram (uma a uma)
  for (const p of mudadas) await upsertPermuta(p);
}

// Quantos itens exigem AÇÃO deste usuário (para o sininho).
// policial: permutas aguardando a assinatura dele (como solicitado).
// admin: permutas aguardando o parecer do P/1.
export async function pendenciasDe(efetivoId: string | null, admin: boolean): Promise<number> {
  const pedidos = await lerPermutas();
  const veP1 = await podeVerP1(efetivoId, admin); // Chefe + Auxiliares do P/1
  const podeSub = await podeComoEncargo(efetivoId, "subcmt", admin);
  let n = 0;
  for (const p of pedidos) {
    if (efetivoId && p.solicitadoId === efetivoId && p.estado === "aguardando_solicitado") n++;
    else if (efetivoId && (p.solicitanteId === efetivoId || p.solicitadoId === efetivoId)
             && (p.estado === "autorizada" || p.estado === "nao_autorizada")
             && !(p.solicitanteId === efetivoId ? p.cienciaSolicitante : p.cienciaSolicitado)) n++;
    else if (veP1 && p.estado === "aguardando_p1") n++;
    else if (podeSub && p.estado === "aguardando_subcmt") n++;
  }
  return n;
}
