import { prisma } from "@/lib/prisma";

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
  | "aguardando_p1"
  | "autorizada"
  | "nao_autorizada"
  | "cancelada";

export type Assinatura = {
  efetivoId: string;
  nome: string;    // nome completo
  linha: string;   // "Sd PM 338/22 Danielle" (posto + PM + nº/barra + guerra)
  em: string;      // ISO da assinatura
};

export type Permuta = {
  id: string;
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
  p1Nome: string | null;
  p1Em: string | null;
  visto: "autorizado" | "nao_autorizado" | null;
  criadoEm: string;
  // controle do "amarrar na escala": vira true quando o substituto ja foi
  // lancado na escala daquele dia (aplicado UMA vez; depois o admin pode
  // editar/excluir livremente sem que o sistema jogue de novo).
  aplicadaPermuta?: boolean;   // dia da permuta (solicitado cobre o solicitante)
  aplicadaRetorno?: boolean;   // dia do retorno (solicitante cobre o solicitado)
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

export async function fichaDe(efetivoId: string): Promise<FichaMin | null> {
  return prisma.efetivo.findUnique({
    where: { id: efetivoId },
    select: { id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true },
  });
}

export async function lerPermutas(): Promise<Permuta[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_PEDIDOS } });
    if (!row?.valor) return [];
    const v = JSON.parse(row.valor);
    return Array.isArray(v) ? (v as Permuta[]) : [];
  } catch {
    return [];
  }
}

export async function salvarPermutas(pedidos: Permuta[]): Promise<void> {
  const valor = JSON.stringify(pedidos);
  await prisma.config.upsert({
    where: { chave: CHAVE_PEDIDOS },
    update: { valor },
    create: { chave: CHAVE_PEDIDOS, valor, descricao: "Solicitações de permuta (documento)" },
  });
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
  { campo: "ftPatrulheiro", lista: false },
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
    const arr: SlotEsc[] = lista ? (Array.isArray(val) ? val : []) : (val && typeof val === "object" ? [val] : []);
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
  let mudouEscala = false, mudouPed = false;

  for (const p of pend) {
    // dia da permuta: o SOLICITADO cobre o SOLICITANTE
    if (!p.aplicadaPermuta && escalas[p.dataPermuta]) {
      const f = await fichaDe(p.solicitanteId);
      if (f && lancarNoDia(escalas[p.dataPermuta], f, p.solicitado?.linha || p.solicitadoNome)) {
        p.aplicadaPermuta = true; mudouEscala = true; mudouPed = true;
      }
    }
    // dia do retorno: o SOLICITANTE cobre o SOLICITADO
    if (!p.aplicadaRetorno && escalas[p.dataRetorno]) {
      const f = await fichaDe(p.solicitadoId);
      if (f && lancarNoDia(escalas[p.dataRetorno], f, p.solicitante.linha)) {
        p.aplicadaRetorno = true; mudouEscala = true; mudouPed = true;
      }
    }
  }

  if (mudouEscala) {
    await prisma.config.upsert({
      where: { chave: CHAVE_ESCALA },
      update: { valor: JSON.stringify(escalas) },
      create: { chave: CHAVE_ESCALA, valor: JSON.stringify(escalas), descricao: "Dias gerados/editados da Escala de Servico" },
    });
  }
  if (mudouPed) await salvarPermutas(pedidos);
}

// Quantos itens exigem AÇÃO deste usuário (para o sininho).
// policial: permutas aguardando a assinatura dele (como solicitado).
// admin: permutas aguardando o parecer do P/1.
export async function pendenciasDe(efetivoId: string | null, admin: boolean): Promise<number> {
  const pedidos = await lerPermutas();
  let n = 0;
  for (const p of pedidos) {
    if (efetivoId && p.solicitadoId === efetivoId && p.estado === "aguardando_solicitado") n++;
    else if (admin && p.estado === "aguardando_p1") n++;
  }
  return n;
}
