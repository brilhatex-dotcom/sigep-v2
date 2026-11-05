import { classificarPatente } from "@/lib/patentes";
import { hojeBR, paraData } from "@/lib/datas";

/* =========================================================================
   COMPORTAMENTO MILITAR — a regra que o P/1 passou para os requerimentos:
     · OFICIAL não tem comportamento: fica em branco;
     · PRAÇA, pelo tempo desde a INCLUSÃO:
         até 5 anos ............ BOM
         de 5 até 10 anos ...... ÓTIMO
         acima de 10 anos ...... EXCEPCIONAL
   Sem data de inclusão na ficha não há como contar: sai em branco, para o
   P/1 completar (e a ficha ser corrigida).
   ========================================================================= */

export const ehOficial = (postoGrad: string | null | undefined) => classificarPatente(postoGrad ?? null).ordem <= 7;

export function comportamentoMilitar(
  postoGrad: string | null | undefined,
  dataInclusao: string | null | undefined,
  hoje: Date = hojeBR(),
): string {
  if (ehOficial(postoGrad)) return "";
  const incl = paraData(dataInclusao ?? null);
  if (!incl) return "";
  const depoisDe = (anos: number) => new Date(incl.getFullYear() + anos, incl.getMonth(), incl.getDate());
  if (hoje <= depoisDe(5)) return "BOM";
  if (hoje <= depoisDe(10)) return "ÓTIMO";
  return "EXCEPCIONAL";
}
