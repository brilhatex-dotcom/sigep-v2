import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   QUEM É O MILITAR ESCRITO NA FOLHA DA ESCALA

   O EXPEDIENTE da escala diária (CMT, SUBCMT, FT, P1, P3, P4, Ronda Escolar,
   Patrulha Maria da Penha) é texto: vem herdado do último dia salvo e boa
   parte foi digitada à mão ("2º Sgt. PM nº 122/07- Júlio", "Asp Of QOEM
   Macedo"). Comparando o texto com o nome do cadastro letra por letra, o
   sistema não reconhecia ninguém, e por isso:
     · quem entrou de FÉRIAS continuava na folha;
     · o PROMOVIDO continuava com o posto antigo (Asp → 2º Ten).

   Aqui o texto é lido como o P/1 lê: pelo Nº/BARRA (122/07), que é único,
   ou pelo NOME DE GUERRA, separando oficial de praça (o Asp promovido a
   2º Ten continua oficial). Só devolve alguém quando a resposta é ÚNICA —
   na dúvida, o texto fica como está.
   ========================================================================= */

export type MilitarDoTexto = {
  id: string;
  postoGrad?: string | null;
  numeroBarra?: string | null;
  nomeGuerra?: string | null;
  nome?: string | null;
};

function norm(t: string): string {
  return String(t || "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "068/18", "68/2018", "068 / 18" -> "68/18"
function normBarra(b: string): string {
  const m = /(\d{1,5})\s*\/\s*(\d{2,4})/.exec(String(b || ""));
  return m ? `${Number(m[1])}/${m[2].slice(-2)}` : "";
}

// palavras de posto, quadro e "nº" — o que sobra é o nome de guerra
const PALAVRAS_POSTO = new Set([
  "sd", "soldado", "cb", "cabo", "sgt", "sargento", "st", "sub", "subten", "subtenente",
  "asp", "aspirante", "of", "oficial", "ten", "tenente", "cap", "capitao", "maj", "major",
  "tc", "cel", "coronel", "pm", "n", "no", "nr", "num", "cmt", "subcmt", "adm",
]);

function guerraDoTexto(t: string): string {
  return norm(t).split(" ")
    .filter((w) => w && !/\d/.test(w) && !PALAVRAS_POSTO.has(w) && !/^qo[a-z]{0,3}$/.test(w))
    .join(" ");
}

// oficial (true), praça (false) ou não dá para saber pelo texto (null)
function oficialPeloTexto(t: string): boolean | null {
  const n = ` ${norm(t)} `;
  if (/ (sub ten|subten|subtenente|st|sd|soldado|cb|cabo|sgt|sargento) /.test(n)) return false;
  if (/ (asp|aspirante|ten|tenente|cap|capitao|maj|major|tc|cel|coronel) /.test(n) || /\bqo[a-z]{0,3}\b/.test(n)) return true;
  return null;
}

function ehOficial(m: MilitarDoTexto): boolean {
  const o = classificarPatente(m.postoGrad ?? null).ordem;
  return o >= 1 && o <= 7;
}

export function idDoTextoEscala(texto: string | null | undefined, efetivo: MilitarDoTexto[]): string {
  const bruto = String(texto || "");
  if (!bruto.trim() || !efetivo?.length) return "";
  const guerra = guerraDoTexto(bruto);
  const ofic = oficialPeloTexto(bruto);

  // 1) Nº/BARRA — único por militar
  const barra = normBarra(bruto);
  if (barra) {
    let c = efetivo.filter((m) => normBarra(m.numeroBarra || "") === barra);
    if (c.length > 1 && guerra) c = c.filter((m) => norm(m.nomeGuerra || "") === guerra);
    if (c.length === 1) return c[0].id;
  }

  // 2) NOME DE GUERRA (+ oficial/praça)
  if (!guerra) return "";
  let c = efetivo.filter((m) => norm(m.nomeGuerra || "") === guerra);
  if (c.length > 1 && ofic !== null) c = c.filter((m) => ehOficial(m) === ofic);
  return c.length === 1 ? c[0].id : "";
}
