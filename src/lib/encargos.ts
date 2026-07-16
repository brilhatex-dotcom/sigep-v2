import { prisma } from "@/lib/prisma";

/* =========================================================================
   Encargos (funções) dos logins. Guardado na tabela Config (chave "encargos")
   como { [refEfetivo]: encargoId } — sem alterar o schema. Dirige permissões
   como "só o Chefe do P/1 assina o parecer da permuta" e "só o Subcmt dá o
   visto (favorável/não)".
   ========================================================================= */

const CHAVE = "encargos";

export type Encargo = {
  id: string; label: string; cargoDoc: string; // cargoDoc = como aparece nas assinaturas
};

export const ENCARGOS: Encargo[] = [
  { id: "cmt", label: "Comandante da Unidade", cargoDoc: "Comandante do 18º BPM" },
  { id: "subcmt", label: "Subcomandante", cargoDoc: "Subcomandante do 18º BPM" },
  { id: "chefe_p1", label: "Chefe da Seção P/1", cargoDoc: "Chefe da Seção P/1-18º BPM" },
  { id: "aux_p1", label: "Auxiliar da Seção P/1", cargoDoc: "Aux. da Seção P/1-18º BPM" },
  { id: "cmt_ft_rotem", label: "Cmt da FT e ROTEM", cargoDoc: "Cmt da FT e ROTEM-18º BPM" },
  { id: "chefe_p3", label: "Chefe do P/3", cargoDoc: "Chefe da Seção P/3-18º BPM" },
  { id: "chefe_p4", label: "Chefe do P/4", cargoDoc: "Chefe da Seção P/4-18º BPM" },
];

export function labelEncargo(id: string): string {
  return ENCARGOS.find((e) => e.id === id)?.label || "";
}
export function cargoDocDe(id: string): string {
  return ENCARGOS.find((e) => e.id === id)?.cargoDoc || "";
}

export async function lerEncargos(): Promise<Record<string, string>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE } });
    const o = row?.valor ? JSON.parse(row.valor) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export async function salvarEncargos(mapa: Record<string, string>): Promise<void> {
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(mapa) },
    create: { chave: CHAVE, valor: JSON.stringify(mapa), descricao: "Encargos/funções dos logins" },
  });
}

// Encargo de um militar (por refEfetivo). "" se não tiver.
export async function encargoDe(refEfetivo: string | null | undefined): Promise<string> {
  if (!refEfetivo) return "";
  const mapa = await lerEncargos();
  return mapa[refEfetivo] || "";
}

// Existe alguém com este encargo? (para decidir se cai no fallback do admin)
export async function existeEncargo(encargoId: string): Promise<boolean> {
  const mapa = await lerEncargos();
  return Object.values(mapa).some((v) => v === encargoId);
}

/* Faz parte da Seção P/1 (Chefe OU Auxiliar) — pode VER/ser notificado das
   permutas do P/1, mesmo que só o Chefe possa assinar o parecer.
   Fallback: se ainda não há Chefe do P/1 atribuído, um admin também vê. */
export async function podeVerP1(refEfetivo: string | null | undefined, admin: boolean): Promise<boolean> {
  const mapa = await lerEncargos();
  const meu = refEfetivo ? mapa[refEfetivo] : "";
  if (meu === "chefe_p1" || meu === "aux_p1") return true;
  const temChefe = Object.values(mapa).some((v) => v === "chefe_p1");
  return !temChefe && admin;
}

/* Pode executar uma ação exigida a um encargo? Regra:
   - quem tem o encargo pode SEMPRE;
   - se NINGUÉM tiver o encargo atribuído ainda, um admin pode (evita travar
     tudo antes de você configurar os encargos). */
export async function podeComoEncargo(refEfetivo: string | null | undefined, encargoId: string, admin: boolean): Promise<boolean> {
  const mapa = await lerEncargos();
  if (refEfetivo && mapa[refEfetivo] === encargoId) return true;
  const alguem = Object.values(mapa).some((v) => v === encargoId);
  return !alguem && admin;
}
