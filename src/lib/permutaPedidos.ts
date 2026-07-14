import { prisma } from "@/lib/prisma";

/* =========================================================================
   Pedidos de PERMUTA iniciados pelo policial.

   Fluxo (substituição de serviço, mão única):
     1) policial pede a um colega para assumir um serviço DELE num dia
        -> estado "aguardando_colega"
     2) o colega concorda -> estado "aguardando_p1" e a vaga da escala ja
        recebe o substituto (slot.permuta = colega, status "pendente")
        (ou "recusada_colega" se ele recusar)
     3) o P/1 defere -> estado "deferida" (slot.status "aprovada", amarrado)
        ou indefere -> estado "indeferida" (limpa o substituto da vaga)

   Guardado na tabela Config (sem alterar o schema em producao):
     - "permuta_pedidos" -> Pedido[]
     - a escala fica em "escala_dias" (o mesmo Config que a escala ja usa)
   ========================================================================= */

const CHAVE_PEDIDOS = "permuta_pedidos";
const CHAVE_ESCALA = "escala_dias";

export type EstadoPedido =
  | "aguardando_colega"
  | "recusada_colega"
  | "aguardando_p1"
  | "deferida"
  | "indeferida"
  | "cancelada";

export type Pedido = {
  id: string;
  data: string;        // dia da escala (aaaa-mm-dd)
  campo: string;       // campo do slot na escala
  idx: number;         // posicao no array (-1 quando o campo e slot unico)
  label: string;       // rotulo legivel do servico
  titular: string;     // nome que esta na vaga (texto da escala)
  solicitanteId: string;
  solicitanteNome: string;
  colegaId: string;
  colegaNome: string;  // nome como sera escrito na escala
  motivo?: string;     // motivo opcional do solicitante
  estado: EstadoPedido;
  motivoP1?: string | null;
  criadoEm: string;
  colegaEm?: string | null;
  p1Em?: string | null;
};

// Campos de um dia da escala que carregam Slot(s). lista=true => array.
export const CAMPOS_ESCALA: { campo: string; label: string; lista: boolean }[] = [
  { campo: "cpuDeDia", label: "CPU de dia", lista: false },
  { campo: "rpAdjunto", label: "RP · Adjunto", lista: false },
  { campo: "rpMotorista", label: "RP · Motorista", lista: false },
  { campo: "rpPatrulheiro", label: "RP · Patrulheiro", lista: true },
  { campo: "ftGraduado", label: "FT · Graduado", lista: false },
  { campo: "ftMotorista", label: "FT · Motorista", lista: false },
  { campo: "ftPatrulheiro", label: "FT · Armeiro/Patrulheiro", lista: false },
  { campo: "guardaPermanente", label: "Permanência", lista: true },
  { campo: "inteligencia", label: "Inteligência", lista: true },
  { campo: "rotemMilitares", label: "ROTEM", lista: true },
];

export type Slot = { titular?: string; permuta?: string | null; status?: string | null };

export function semTags(html: string): string {
  return String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function safeParse(s: string | null | undefined): Record<string, any> {
  try { const o = JSON.parse(s || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}

// ---------- Pedidos ----------
export async function lerPedidos(): Promise<Pedido[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_PEDIDOS } });
    if (!row?.valor) return [];
    const v = JSON.parse(row.valor);
    return Array.isArray(v) ? (v as Pedido[]) : [];
  } catch {
    return [];
  }
}

export async function salvarPedidos(pedidos: Pedido[]): Promise<void> {
  const valor = JSON.stringify(pedidos);
  await prisma.config.upsert({
    where: { chave: CHAVE_PEDIDOS },
    update: { valor },
    create: { chave: CHAVE_PEDIDOS, valor, descricao: "Pedidos de permuta iniciados pelo policial" },
  });
}

// ---------- Escala (slots) ----------
export async function lerEscalaDias(): Promise<Record<string, any>> {
  const row = await prisma.config.findUnique({ where: { chave: CHAVE_ESCALA } });
  return safeParse(row?.valor);
}

function pegarSlot(dia: any, campo: string, idx: number): Slot | undefined {
  if (!dia) return undefined;
  const val = dia[campo];
  if (idx >= 0) return Array.isArray(val) ? val[idx] : undefined;
  return val && typeof val === "object" ? val : undefined;
}

// Aplica um patch a UM slot da escala e salva. Devolve true se conseguiu.
export async function atualizarSlot(
  data: string, campo: string, idx: number, patch: Partial<Slot>
): Promise<boolean> {
  const escalas = await lerEscalaDias();
  const dia = escalas[data];
  const slot = pegarSlot(dia, campo, idx);
  if (!slot) return false;
  Object.assign(slot, patch);
  await prisma.config.upsert({
    where: { chave: CHAVE_ESCALA },
    update: { valor: JSON.stringify(escalas) },
    create: { chave: CHAVE_ESCALA, valor: JSON.stringify(escalas), descricao: "Dias gerados/editados da Escala de Servico" },
  });
  return true;
}

// ---------- Matching do titular com o policial logado ----------
// Heuristica: a vaga e "minha" se o texto do titular contém meu nome de guerra,
// meu numero/barra ou minha matricula. Cobre os formatos usados na escala
// (ex.: "Cb PM nº 252/17- Francilea").
export function slotEhDoMilitar(
  titular: string,
  militar: { nomeGuerra?: string | null; nome?: string | null; numeroBarra?: string | null; matricula?: string | null }
): boolean {
  const alvo = semTags(titular).toLowerCase();
  if (!alvo) return false;
  const cands: string[] = [];
  if (militar.nomeGuerra) cands.push(militar.nomeGuerra);
  if (militar.numeroBarra) cands.push(militar.numeroBarra);
  if (militar.matricula) cands.push(militar.matricula);
  // primeiro e ultimo nome como reforço, quando nao ha nome de guerra
  if (!militar.nomeGuerra && militar.nome) {
    const partes = militar.nome.trim().split(/\s+/);
    if (partes[0]) cands.push(partes[0]);
    if (partes.length > 1) cands.push(partes[partes.length - 1]);
  }
  return cands.some((c) => {
    const t = String(c).trim().toLowerCase();
    return t.length >= 3 && alvo.includes(t);
  });
}

// Lista os slots de um dia (para a visao somente-leitura da escala da sede).
export type SlotView = {
  campo: string; idx: number; label: string;
  titular: string; permuta: string | null; status: string | null;
};
export function slotsDoDia(dia: any): SlotView[] {
  const out: SlotView[] = [];
  if (!dia || typeof dia !== "object") return out;
  for (const { campo, label, lista } of CAMPOS_ESCALA) {
    const val = dia[campo];
    if (lista) {
      const arr: Slot[] = Array.isArray(val) ? val : [];
      arr.forEach((sl, idx) => {
        const t = semTags(sl?.titular || "");
        if (t) out.push({ campo, idx, label, titular: t, permuta: sl?.permuta ?? null, status: sl?.status ?? null });
      });
    } else if (val && typeof val === "object") {
      const t = semTags((val as Slot).titular || "");
      if (t) out.push({ campo, idx: -1, label, titular: t, permuta: (val as Slot).permuta ?? null, status: (val as Slot).status ?? null });
    }
  }
  return out;
}
