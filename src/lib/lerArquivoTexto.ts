/* =========================================================================
   TIRAR O TEXTO DE UM ARQUIVO — Word (.docx e .doc antigo), PDF ou texto.

   Roda no NAVEGADOR, como já é feito na importação do listão de promoções: o
   arquivo não sobe para o servidor, só o texto lido. Um histórico traz dados
   pessoais e punições de um policial, então quanto menos ele viajar, melhor.

   O .doc antigo (Word 97) é o formato dos históricos velhos do Batalhão, e
   por isso vale o trabalho de abrir na mão: é um "compound file" — um
   sisteminha de arquivos dentro do arquivo — e o texto ainda vem picado numa
   tabela de pedaços. Sem isso, o P/1 teria que reabrir e reconverter cada um
   no Word antes de importar.
   ========================================================================= */

export type TipoArquivo = "docx" | "doc" | "pdf" | "txt";

export function tipoDoArquivo(nome: string): TipoArquivo | null {
  const n = (nome || "").toLowerCase();
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".doc")) return "doc";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".txt")) return "txt";
  return null;
}

export async function lerTextoDoArquivo(arquivo: File): Promise<string> {
  const tipo = tipoDoArquivo(arquivo.name);
  if (!tipo) throw new Error("Formato não reconhecido. Use .docx, .doc, .pdf ou .txt.");
  const buffer = await arquivo.arrayBuffer();
  if (tipo === "txt") return new TextDecoder("utf-8").decode(buffer);
  if (tipo === "docx") return await lerDocx(buffer);
  if (tipo === "doc") return lerDocAntigo(buffer);
  return await lerPdf(buffer);
}

/* ----------------------------------------------------------- .docx */

async function lerDocx(buffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const arq = zip.file("word/document.xml");
  if (!arq) throw new Error("Este .docx não tem o documento dentro (arquivo corrompido?).");
  const xml = await arq.async("string");

  /* Cada <w:p> é um parágrafo e cada <w:tab/> uma tabulação; o resto das
     etiquetas some. As marcas de célula/linha de tabela viram quebra de
     linha, senão o texto de uma tabela sairia tudo grudado. */
  const texto = xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "  ")
    .replace(/<\/w:tc>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return desescapar(texto);
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/* ------------------------------------------------------------ .pdf */

async function lerPdf(buffer: ArrayBuffer): Promise<string> {
  /* Mesmo pdf.js servido do próprio site que a importação do listão usa —
     ver o comentário em ocrListao.ts sobre por que ele não é empacotado. */
  const caminho = "/ocr/pdf.min.mjs";
  const pdfjs: any = await import(/* webpackIgnore: true */ caminho);
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let texto = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const tc = await pagina.getTextContent();
    /* Junta por ALTURA: o pdf.js entrega pedaços soltos, e sem reagrupar por
       linha o "IV – PROMOÇÕES" chegaria partido e a seção não seria
       reconhecida. */
    const linhas = new Map<number, { x: number; t: string }[]>();
    for (const item of tc.items as any[]) {
      if (!item?.str || !item.str.trim()) continue;
      const y = Math.round(-item.transform[5] / 3);   // tolerância de ~3pt
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y)!.push({ x: item.transform[4], t: item.str });
    }
    for (const y of Array.from(linhas.keys()).sort((a, b) => a - b)) {
      texto += linhas.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.t).join("").replace(/\s+/g, " ").trim() + "\n";
    }
  }
  if (texto.replace(/\s/g, "").length < 200) {
    throw new Error("Este PDF não tem texto dentro (parece escaneado). Importe o Word, ou passe o PDF por um leitor de texto antes.");
  }
  return texto;
}

/* ------------------------------------------------------------ .doc */

/* O .doc é um "compound file": setores de tamanho fixo, uma tabela de
   alocação ligando um setor ao próximo, e um diretório dizendo onde cada
   fluxo começa. Precisamos de dois fluxos: "WordDocument" (o texto) e a
   tabela ("1Table"/"0Table"), que diz como o texto está picado. */
type Cfb = { fluxo(nome: string): Uint8Array | null };

function abrirCompound(buffer: ArrayBuffer): Cfb {
  const d = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const assinatura = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (assinatura.some((b, i) => bytes[i] !== b)) {
    throw new Error("Este .doc não parece um documento do Word. Se ele foi renomeado, salve como .docx e tente de novo.");
  }

  const tamSetor = 1 << d.getUint16(0x1e, true);
  const tamMini = 1 << d.getUint16(0x20, true);
  const primDir = d.getUint32(0x30, true);
  const corteMini = d.getUint32(0x38, true);
  const primMiniFat = d.getUint32(0x3c, true);
  const primDifat = d.getUint32(0x44, true);
  const qtdDifat = d.getUint32(0x48, true);
  const inicio = (s: number) => (s + 1) * tamSetor;

  // DIFAT: os 109 primeiros ponteiros ficam no cabeçalho; o resto em cadeia.
  const setoresFat: number[] = [];
  for (let i = 0; i < 109; i++) {
    const v = d.getUint32(0x4c + i * 4, true);
    if (v === 0xffffffff) break;
    setoresFat.push(v);
  }
  let s = primDifat;
  for (let n = 0; n < qtdDifat && s !== 0xffffffff && s !== 0xfffffffe; n++) {
    const base = inicio(s);
    const porSetor = tamSetor / 4 - 1;
    for (let i = 0; i < porSetor; i++) {
      const v = d.getUint32(base + i * 4, true);
      if (v !== 0xffffffff) setoresFat.push(v);
    }
    s = d.getUint32(base + porSetor * 4, true);
  }

  const fat: number[] = [];
  for (const set of setoresFat) {
    const base = inicio(set);
    for (let i = 0; i < tamSetor / 4; i++) fat.push(d.getUint32(base + i * 4, true));
  }

  const cadeia = (primeiro: number, tabela: number[]): number[] => {
    const out: number[] = [];
    let atual = primeiro;
    // o limite evita laço infinito se a tabela estiver corrompida
    while (atual !== 0xfffffffe && atual !== 0xffffffff && out.length < 1_000_000) {
      out.push(atual);
      atual = tabela[atual] ?? 0xfffffffe;
    }
    return out;
  };

  const juntar = (setores: number[], tamanho: number, base: (n: number) => number, passo: number) => {
    const out = new Uint8Array(tamanho);
    let escrito = 0;
    for (const set of setores) {
      const de = base(set);
      const quanto = Math.min(passo, tamanho - escrito);
      if (quanto <= 0) break;
      out.set(bytes.subarray(de, de + quanto), escrito);
      escrito += quanto;
    }
    return out;
  };

  // Diretório: entradas de 128 bytes.
  const dirBytes = juntar(cadeia(primDir, fat), cadeia(primDir, fat).length * tamSetor, inicio, tamSetor);
  const entradas: { nome: string; setor: number; tamanho: number }[] = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const tamNome = new DataView(dirBytes.buffer, dirBytes.byteOffset + off).getUint16(0x40, true);
    if (tamNome <= 0 || tamNome > 64) continue;
    let nome = "";
    for (let i = 0; i < tamNome - 2; i += 2) nome += String.fromCharCode(dirBytes[off + i] | (dirBytes[off + i + 1] << 8));
    const dv = new DataView(dirBytes.buffer, dirBytes.byteOffset + off);
    entradas.push({ nome, setor: dv.getUint32(0x74, true), tamanho: dv.getUint32(0x78, true) });
  }

  // Fluxos pequenos moram no "mini stream", que é um fluxo dentro da raiz.
  const raiz = entradas[0];
  const miniFat: number[] = [];
  for (const set of cadeia(primMiniFat, fat)) {
    const base = inicio(set);
    for (let i = 0; i < tamSetor / 4; i++) miniFat.push(d.getUint32(base + i * 4, true));
  }
  const miniStream = raiz ? juntar(cadeia(raiz.setor, fat), raiz.tamanho, inicio, tamSetor) : new Uint8Array(0);

  return {
    fluxo(nome: string) {
      const e = entradas.find((x) => x.nome === nome);
      if (!e) return null;
      if (e.tamanho < corteMini) {
        const out = new Uint8Array(e.tamanho);
        let escrito = 0;
        for (const set of cadeia(e.setor, miniFat)) {
          const de = set * tamMini;
          const quanto = Math.min(tamMini, e.tamanho - escrito);
          if (quanto <= 0) break;
          out.set(miniStream.subarray(de, de + quanto), escrito);
          escrito += quanto;
        }
        return out;
      }
      return juntar(cadeia(e.setor, fat), e.tamanho, inicio, tamSetor);
    },
  };
}

export function lerDocAntigo(buffer: ArrayBuffer): string {
  const cfb = abrirCompound(buffer);
  const wd = cfb.fluxo("WordDocument");
  if (!wd) throw new Error("Este .doc não tem o texto dentro (arquivo corrompido?).");
  const dw = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);

  // Qual das duas tabelas vale está num bit do cabeçalho.
  const bandeiras = dw.getUint16(0x0a, true);
  const nomeTabela = (bandeiras >> 9) & 1 ? "1Table" : "0Table";
  const tb = cfb.fluxo(nomeTabela) || cfb.fluxo("1Table") || cfb.fluxo("0Table");
  if (!tb) throw new Error("Este .doc está sem a tabela de texto.");
  const dt = new DataView(tb.buffer, tb.byteOffset, tb.byteLength);

  /* Caminha pelo cabeçalho (FIB) até a lista de endereços, e pega a entrada
     33: onde fica a tabela de pedaços do texto. */
  let p = 32;
  p += 2 + dw.getUint16(p, true) * 2;   // fibRgW
  p += 2 + dw.getUint16(p, true) * 4;   // fibRgLw
  p += 2;                               // tamanho de fibRgFcLcb
  const fcClx = dw.getUint32(p + 33 * 8, true);
  const lcbClx = dw.getUint32(p + 33 * 8 + 4, true);

  // Dentro do CLX, pula os blocos de propriedades (0x01) até o Pcdt (0x02).
  let i = fcClx;
  const fim = fcClx + lcbClx;
  while (i < fim && tb[i] === 1) i += 3 + dt.getUint16(i + 1, true);
  if (i >= fim || tb[i] !== 2) throw new Error("Não consegui achar o texto dentro deste .doc.");
  const lcb = dt.getUint32(i + 1, true);
  const plc = i + 5;
  const n = (lcb - 4) / 12;

  const posicoes: number[] = [];
  for (let k = 0; k <= n; k++) posicoes.push(dt.getUint32(plc + k * 4, true));

  let texto = "";
  for (let k = 0; k < n; k++) {
    const base = plc + (n + 1) * 4 + k * 8;
    const fc = dt.getUint32(base + 2, true);
    /* Bit 30 ligado = o pedaço está em 1 byte por letra (cp1252); desligado =
       2 bytes (UTF-16). Um mesmo documento mistura os dois. */
    const comprimido = (fc & 0x40000000) !== 0;
    const de = comprimido ? (fc & 0x3fffffff) / 2 : (fc & 0x3fffffff);
    const quantos = posicoes[k + 1] - posicoes[k];
    if (comprimido) {
      for (let j = 0; j < quantos; j++) texto += CP1252[wd[de + j]] ?? String.fromCharCode(wd[de + j]);
    } else {
      for (let j = 0; j < quantos; j++) texto += String.fromCharCode(wd[de + j * 2] | (wd[de + j * 2 + 1] << 8));
    }
  }

  return texto
    .replace(/\r/g, "\n")
    .replace(/[\x07\x0b\x0c]/g, "\n")   // fim de célula/linha de tabela e quebra de página
    .replace(/[\x13\x14\x15\x01\x02\x08]/g, "");  // marcas de campo e âncoras de imagem
}

/* As 32 posições em que o cp1252 difere do Latin-1 (aspas curvas, travessão,
   reticências) — justamente as que aparecem em documento do Word. */
const CP1252: Record<number, string> = {
  128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡", 136: "ˆ", 137: "‰",
  138: "Š", 139: "‹", 140: "Œ", 142: "Ž", 145: "'", 146: "'", 147: "“", 148: "”",
  149: "•", 150: "–", 151: "—", 152: "˜", 153: "™", 154: "š", 155: "›", 156: "œ", 158: "ž", 159: "Ÿ",
};
