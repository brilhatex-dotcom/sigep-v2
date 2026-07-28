import { prisma } from "@/lib/prisma";
import { ORGANOGRAMA, type NoOrg } from "@/lib/organograma";

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

// Encargos fixos do Comando/Seções (18º BPM).
const ENCARGOS_BASE: Encargo[] = [
  { id: "cmt", label: "Comandante da Unidade", cargoDoc: "Comandante do 18º BPM" },
  { id: "subcmt", label: "Subcomandante", cargoDoc: "Subcomandante do 18º BPM" },
  { id: "chefe_p1", label: "Chefe da Seção P/1", cargoDoc: "Chefe da Seção P/1-18º BPM" },
  { id: "aux_p1", label: "Auxiliar da Seção P/1", cargoDoc: "Aux. da Seção P/1-18º BPM" },
  { id: "cmt_ft_rotem", label: "Cmt da FT e ROTEM", cargoDoc: "Cmt da FT e ROTEM-18º BPM" },
  { id: "chefe_p3", label: "Chefe do P/3", cargoDoc: "Chefe da Seção P/3-18º BPM" },
  { id: "chefe_p4", label: "Chefe do P/4", cargoDoc: "Chefe da Seção P/4-18º BPM" },
];

/* Encargos de COMANDANTE DE LUGAR (CIA, DPM/Pelotão), gerados do organograma.
   id = "cmt_<noId>" (ex.: cmt_3cia-p1). Assim cada localidade tem o seu Cmt,
   que fará a escala do próprio lugar. O "noId" liga o encargo à unidade do
   organograma (usado depois para restringir o acesso à própria lotação). */
function coletarLugares(no: NoOrg, acc: { id: string; rotulo: string }[]): void {
  const ehCia = /^\d+cia$/.test(no.id);
  const ehPelotao = /-p\d+$/.test(no.id);
  // O 1º Pel de uma CIA É a própria CIA (mesma sede/cidade). Não gera lugar
  // separado: a CIA já cobre o 1º Pel (um só Cmt, uma só escala). Os demais
  // pelotões (2º, 3º...) continuam como lugares próprios.
  const eh1PelDaCia = /^\d+cia-p1$/.test(no.id);
  // A 1ª CIA É a sede (mesmo quartel, mesma escala, mesmo comando). Não entra
  // como lugar: não tem Cmt/Sargenteante próprios nem escala separada — quem
  // conduz é o P/1, pela folha da sede.
  const ehSede = no.id === "1cia";
  if ((ehCia || ehPelotao) && !eh1PelDaCia && !ehSede) acc.push({ id: no.id, rotulo: no.rotulo });
  for (const f of no.filhos ?? []) coletarLugares(f, acc);
}
export const LUGARES_COMANDO: { id: string; rotulo: string }[] = (() => {
  const a: { id: string; rotulo: string }[] = [];
  coletarLugares(ORGANOGRAMA, a);
  return a;
})();
export const ENCARGOS_CMT_LUGAR: Encargo[] = LUGARES_COMANDO.map((l) => ({
  id: `cmt_${l.id}`,
  label: `Cmt — ${l.rotulo}`,
  cargoDoc: `Comandante do ${l.rotulo}`,
}));
// Sargenteante de cada lugar: faz a escala do lugar e encaminha ao Cmt.
export const ENCARGOS_SARG_LUGAR: Encargo[] = LUGARES_COMANDO.map((l) => ({
  id: `sarg_${l.id}`,
  label: `Sargenteante — ${l.rotulo}`,
  cargoDoc: `Sargenteante do ${l.rotulo}`,
}));

// noId do lugar a partir de um encargo de lugar ("cmt_3cia-p1"/"sarg_3cia-p1" -> "3cia-p1").
export function lugarDoEncargo(encargoId: string): string | null {
  if (!encargoId) return null;
  const resto = encargoId.startsWith("cmt_") ? encargoId.slice(4) : encargoId.startsWith("sarg_") ? encargoId.slice(5) : "";
  // "1cia" nao e lugar: a 1a CIA e a propria sede (ver coletarLugares).
  if (resto === "1cia") return null;
  return /^\d+cia(-p\d+)?$/.test(resto) ? resto : null;
}
// É um encargo de comando/sargenteante de LUGAR (não os do Comando/Seções)?
export function ehEncargoDeLugar(encargoId: string): boolean {
  return lugarDoEncargo(encargoId) !== null;
}

export const ENCARGOS: Encargo[] = [...ENCARGOS_BASE, ...ENCARGOS_CMT_LUGAR, ...ENCARGOS_SARG_LUGAR];

/* Encargos com ACESSO TOTAL (equivalente a admin): Cmt do BPM, Subcmt e Chefe
   do P/1. Quem tem um destes entra no sistema já como admin (vê e faz tudo). */
export const ENCARGOS_ACESSO_TOTAL = ["cmt", "subcmt", "chefe_p1"];
export async function temAcessoTotalPorEncargo(refEfetivo: string | null | undefined): Promise<boolean> {
  if (!refEfetivo) return false;
  const enc = await encargoDe(refEfetivo);
  return ENCARGOS_ACESSO_TOTAL.includes(enc);
}

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
