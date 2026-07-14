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
