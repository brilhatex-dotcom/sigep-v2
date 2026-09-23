import ExcelJS from "exceljs";

/* =========================================================================
   IMPORTAR UMA PLANILHA PADRÃO JÁ FEITA (ex.: a de agosto/2026)

   A planilha que o P/1 preencheu à mão no ciclo anterior sabe coisas que o
   sistema ainda não sabe: o BG da promoção a Cabo de 2011, a nota do CEFS,
   quantos elogios e medalhas, a data de inclusão que ficou em branco na
   ficha. Digitar isso de novo é retrabalho; perder é pior.

   O que se faz com cada dado — tudo vai para a FICHA do militar:
     · dados funcionais (inclusão, escolaridade, número) -> só onde está
       VAZIO. Ficha preenchida nunca é sobrescrita: ela é a fonte oficial e
       pode estar mais nova que a planilha;
     · o resto -> seção "Dados para Promoção" da ficha (src/lib/dadosPromocao.ts):
       BG das promoções, CEFC/CEFS/CAP/EAP com nota, cursos, elogios,
       medalhas, conceito, comportamento, QPMP. Dali a Planilha Padrão puxa
       em toda promoção. Por padrão só completa campo vazio; o P/1 pode
       mandar atualizar com uma planilha mais nova.

   O que NÃO se importa: certidões, situação jurídica e situação
   administrativa. Essas valem só para o ciclo delas — trazer o "S/A" de
   agosto para dezembro seria atestar certidão que ninguém leu.

   O arquivo é lido em memória e descartado: não fica guardado em lugar
   nenhum (tem nome, matrícula e ID de todo mundo).
   ========================================================================= */

export type LinhaImportada = {
  linha: number;                       // número da linha no Excel
  valores: Record<string, string>;     // chave da coluna (a da Planilha Padrão) -> texto
};

// Título normalizado -> chave. Aceita o modelo da CPPPM e a variação da
// Unidade ("CAP/CAS", "INCL." sem espaço, "MEDALHAS / TÍTULO"...).
const TITULOS: Record<string, string> = {
  GRAD: "grad", NUM: "num", NOME: "nome", MAT: "mat", MATRICULA: "mat", ID: "id",
  INSTRUCAO: "instrucao", INCL: "incl", INCLUSAO: "incl", QPMP: "qpmp", COMPORT: "comport",
  COMPORTAMENTO: "comport", CURSOS150H: "cursos", CURSOS: "cursos",
  PROMCABO: "promCabo", PROMCB: "promCabo", PROM3SGT: "prom3", PROM2SGT: "prom2", PROM1SGT: "prom1",
  CEFC: "cefc", CEFS: "cefs", CAP: "cap", CAPCAS: "cap", CAS: "cap", EAP: "eap",
  ELOGIOSQTD: "elogios", ELOGIOS: "elogios", MEDALHASTITULO: "medalhas", MEDALHAS: "medalhas",
  FICHACONCEITO: "conceito", CONCEITO: "conceito",
};

export const normTitulo = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
    .replace(/^PROM([123])O?SGT$/, "PROM$1SGT");

export const normNome = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

export const soDigitos = (t: string) => t.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const dois = (n: number) => String(n).padStart(2, "0");

function textoDaCelula(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // datas do Excel chegam como meia-noite UTC: ler em UTC para não voltar um dia
    return `${dois(v.getUTCDate())}/${dois(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  if (typeof v === "object") {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join("");
    if ("result" in o) return textoDaCelula(o.result);
    if ("text" in o) return String(o.text);
    return "";
  }
  return String(v);
}

/* "25/12/2009               BG Nº 129, 12/07/2011" -> "25/12/2009\nBG nº 129 de 12/07/2011"
   A Unidade usou espaços para empurrar o BG para a linha de baixo; aqui
   fica o formato da planilha gerada pelo sistema. */
export function normalizarPromocao(t: string): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (!s || /^s\/?a$/i.test(s)) return s ? "S/A" : "";
  const data = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  const bg = s.match(/\bBG\s*(?:n[º°o]\.?\s*)?(\d+)\s*,?\s*(?:de\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (!data && !bg) return s;
  return [data?.[1] || "", bg ? `BG nº ${bg[1]} de ${bg[2]}` : ""].filter(Boolean).join("\n");
}

// "SIM/  9,390" -> "SIM/ 9,390" ; "SIM / 7,660" -> "SIM/ 7,660"
export const normalizarCurso = (t: string) =>
  t.replace(/\s+/g, " ").trim().replace(/^SIM\s*\/\s*/i, "SIM/ ").replace(/^s\/a$/i, "S/A");

const PROMOCOES = new Set(["promCabo", "prom3", "prom2", "prom1"]);
const CURSOS = new Set(["cefc", "cefs", "cap", "eap"]);

export async function lerPlanilhaAnterior(buf: Buffer | ArrayBuffer): Promise<{ linhas: LinhaImportada[]; aba: string; colunas: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  // a aba certa é a que tem o cabeçalho GRAD ... NOME
  for (const ws of wb.worksheets) {
    let cab = 0;
    const mapa = new Map<number, string>();
    for (let r = 1; r <= Math.min(ws.rowCount, 20) && !cab; r++) {
      const row = ws.getRow(r);
      const achadas = new Map<number, string>();
      row.eachCell((cel, c) => {
        const k = TITULOS[normTitulo(textoDaCelula(cel.value))];
        if (k && ![...achadas.values()].includes(k)) achadas.set(c, k);
      });
      const chaves = new Set(achadas.values());
      if (chaves.has("grad") && chaves.has("nome")) { cab = r; achadas.forEach((k, c) => mapa.set(c, k)); }
    }
    if (!cab) continue;

    const linhas: LinhaImportada[] = [];
    for (let r = cab + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const valores: Record<string, string> = {};
      mapa.forEach((k, c) => {
        let t = textoDaCelula(row.getCell(c).value).trim();
        if (PROMOCOES.has(k)) t = normalizarPromocao(t);
        else if (CURSOS.has(k)) t = normalizarCurso(t);
        else t = t.replace(/[ \t]+/g, " ").trim();
        if (t) valores[k] = t;
      });
      // o termo de assinatura e as linhas vazias do fim não são militares
      if (!valores.nome || !valores.grad) continue;
      if (/^quartel|^\s*$/i.test(valores.grad)) continue;
      linhas.push({ linha: r, valores });
    }
    return { linhas, aba: ws.name, colunas: [...new Set(mapa.values())] };
  }
  return { linhas: [], aba: "", colunas: [] };
}

/* ------------------------------------------------------------ casar */

export type MilitarParaCasar = {
  id: string; nome: string | null; matricula: string | null; numeroBarra: string | null;
  dataIncorp: string | null; grauEscolaridade: string | null;
};

/* Casa cada linha com um militar do efetivo: primeiro pelo ID, depois pela
   matrícula, e por último pelo nome completo. Nome sozinho só vale se for
   único no efetivo — dois "JOSÉ DA SILVA" não se casam por palpite. */
export function casar(linhas: LinhaImportada[], efetivo: MilitarParaCasar[]) {
  const porId = new Map<string, MilitarParaCasar>();
  const porMat = new Map<string, MilitarParaCasar>();
  const porNome = new Map<string, MilitarParaCasar[]>();
  for (const m of efetivo) {
    if (soDigitos(m.id)) porId.set(soDigitos(m.id), m);
    if (m.matricula && soDigitos(m.matricula)) porMat.set(soDigitos(m.matricula), m);
    const n = normNome(m.nome || "");
    if (n) porNome.set(n, [...(porNome.get(n) || []), m]);
  }
  const casadas: { linha: LinhaImportada; militar: MilitarParaCasar; por: "ID" | "matrícula" | "nome" }[] = [];
  const sobras: LinhaImportada[] = [];
  const usados = new Set<string>();
  for (const l of linhas) {
    const v = l.valores;
    let m: MilitarParaCasar | undefined, por: "ID" | "matrícula" | "nome" = "ID";
    if (v.id && porId.has(soDigitos(v.id))) m = porId.get(soDigitos(v.id));
    if (!m && v.mat && porMat.has(soDigitos(v.mat))) { m = porMat.get(soDigitos(v.mat)); por = "matrícula"; }
    if (!m) {
      const xs = porNome.get(normNome(v.nome || "")) || [];
      if (xs.length === 1) { m = xs[0]; por = "nome"; }
    }
    if (m && !usados.has(m.id)) { usados.add(m.id); casadas.push({ linha: l, militar: m, por }); }
    else sobras.push(l);
  }
  return { casadas, sobras };
}

/* ------------------------------------------------------------ o plano */

// "ENSINO SUPERIOR COMPLETO" -> "Ensino Superior Completo" (como a ficha guarda)
const tituloProprio = (t: string) =>
  t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Em|E)\b/g, (x) => x.toLowerCase());

// o que vai para a ficha (só onde está vazio) e o que vira referência
export const CAMPOS_FICHA: Record<string, "dataIncorp" | "grauEscolaridade" | "numeroBarra"> = {
  incl: "dataIncorp", instrucao: "grauEscolaridade", num: "numeroBarra",
};
export const CAMPOS_DADOS_PROMOCAO = [
  "qpmp", "comport", "cursos", "promCabo", "prom3", "prom2", "prom1",
  "cefc", "cefs", "cap", "eap", "elogios", "medalhas", "conceito",
];

export type PlanoMilitar = {
  efetivoId: string;
  ficha: Partial<Record<"dataIncorp" | "grauEscolaridade" | "numeroBarra", string>>;
  promocao: Record<string, string>;   // seção "Dados para Promoção" da ficha
};

export function planejar(casadas: ReturnType<typeof casar>["casadas"]): PlanoMilitar[] {
  return casadas.map(({ linha, militar }) => {
    const v = linha.valores;
    const ficha: PlanoMilitar["ficha"] = {};
    for (const [col, campo] of Object.entries(CAMPOS_FICHA)) {
      const novo = v[col];
      if (!novo || (militar[campo] || "").trim()) continue;
      if (campo === "dataIncorp" && !/^\d{2}\/\d{2}\/\d{4}$/.test(novo)) continue;
      ficha[campo] = campo === "grauEscolaridade" ? tituloProprio(novo) : novo;
    }
    const promocao: Record<string, string> = {};
    for (const k of CAMPOS_DADOS_PROMOCAO) if (v[k]) promocao[k] = v[k];
    return { efetivoId: militar.id, ficha, promocao };
  });
}
