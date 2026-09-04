/* Referência oficial do militar nos documentos: POSTO QUADRO Nº/BARRA Nome
   Completo (ex.: "SD PM 169/24 Gleydson Robson Rocha da Silva").

   Fica aqui, fora do componente de tela, porque o servidor precisa da MESMA
   regra: o FATD em Word é montado no servidor e tem que sair com a mesma
   identificação que aparece na tela. */

export type MilitarLite = {
  id: string; postoGrad: string; nome: string; nomeGuerra: string;
  numeroBarra: string; quadro?: string; rg?: string;
};

export function abrevPosto(p: string): string {
  const m: Record<string, string> = {
    "coronel": "CEL", "tenente-coronel": "TEN CEL", "tenente coronel": "TEN CEL", "major": "MAJ",
    "capitão": "CAP", "capitao": "CAP", "1º tenente": "1º TEN", "1° tenente": "1º TEN",
    "2º tenente": "2º TEN", "2° tenente": "2º TEN", "aspirante a oficial": "ASP OF", "aspirante": "ASP OF",
    "subtenente": "SUB TEN", "1º sargento": "1º SGT", "2º sargento": "2º SGT", "3º sargento": "3º SGT",
    "cabo": "CB", "soldado": "SD",
  };
  return m[(p || "").trim().toLowerCase()] ?? (p || "").trim().toUpperCase();
}

export function refMilitar(m: MilitarLite): string {
  const posto = abrevPosto(m.postoGrad);
  const q = (m.quadro || "PM").trim() || "PM";
  const barra = (m.numeroBarra || "").trim();
  const nome = (m.nome || m.nomeGuerra || "").trim();
  return [posto, q, barra, nome].filter(Boolean).join(" ").trim();
}

/* Grau / nome / RG de quem o campo de texto livre aponta.

   O grau sai COM o número da barra ("SD PM 169/24"): é assim que o modelo do
   FATD escreve o grau hierárquico e assina. Sem correspondência no efetivo,
   devolve o texto livre como nome. */
export type DadosPessoa = { grau: string; nome: string; rg: string };

export function dadosDoTexto(texto: string, efetivo: MilitarLite[]): DadosPessoa | null {
  const s = (texto || "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  const m =
    efetivo.find((e) => refMilitar(e) === s) ||
    efetivo.find((e) => e.numeroBarra && low.includes(e.numeroBarra.toLowerCase())) ||
    efetivo.find((e) => e.nome && low.includes(e.nome.toLowerCase()));
  if (!m) return { grau: "", nome: s, rg: "" };
  const nome = (m.nome || m.nomeGuerra || "").trim();
  const grau = refMilitar(m).replace(nome, "").replace(/\s+/g, " ").trim();
  return { grau, nome, rg: (m.rg || "").trim() };
}

/* "SD PM 169/24 GLEYDSON ROBSON ROCHA DA SILVA" — linha de assinatura. */
export function assinanteFatd(d: DadosPessoa | null | undefined, textoLivre = ""): string {
  const grau = (d?.grau || "").trim();
  const nome = (d?.nome || textoLivre || "").trim();
  return [grau, nome.toUpperCase()].filter(Boolean).join(" ");
}
