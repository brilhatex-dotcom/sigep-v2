/* =========================================================================
   LER O ARQUIVO DO LISTÃO NO NAVEGADOR

   Roda no computador de quem está importando, nunca no servidor. Dois motivos:
   a Vercel não tem como rodar OCR (é pesado e a função tem limite de tempo e
   tamanho), e assim o arquivo com os dados do efetivo não sai da máquina —
   só o TEXTO lido é enviado para o cruzamento.

   Caminho rápido: se o PDF já tiver texto dentro (quando vem do Diário
   Oficial em vez de fotocopiado), a leitura é exata e o OCR nem roda.

   Os arquivos do OCR são servidos pelo próprio SIGEP (/public/ocr), e não por
   CDN de fora, porque a política de segurança do site (CSP em next.config.js)
   só aceita script e conexão do próprio domínio.
   ========================================================================= */

export type ProgressoLeitura = {
  fase: "abrindo" | "texto" | "ocr" | "pronto";
  pagina: number;
  totalPaginas: number;
  pct: number;          // 0 a 100 dentro da página
  recado: string;
};

type AoAndar = (p: ProgressoLeitura) => void;

// abaixo disso a página é imagem pura e precisa de OCR
const MINIMO_TEXTO_POR_PAGINA = 200;

/* Escala de desenho da página. O listão original é A4 a 300 dpi (2480 px de
   largura) e o OCR acerta bem mais perto dessa resolução do que em tela. */
const ESCALA = 4;

/* O pdf.js é carregado do próprio site em vez de empacotado junto do app.

   Duas razões: ele usa "top-level await", e empacotá-lo obrigaria a subir o
   alvo de compilação do SIGEP INTEIRO (o que quebraria celular mais antigo em
   todas as outras telas); e assim o peso dele só é baixado por quem abre esta
   tela, que é só o P/1. O webpackIgnore manda o empacotador não tocar neste
   import — vira um import de verdade do navegador, do próprio domínio, que a
   política de segurança do site permite. */
async function carregarPdfjs() {
  // endereço numa variável: assim o TypeScript não tenta resolver um caminho
  // que só existe em tempo de execução, servido de /public
  const caminho = "/ocr/pdf.min.mjs";
  const pdfjs: any = await import(/* webpackIgnore: true */ caminho);
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  return pdfjs;
}

/* Lê um PDF: primeiro tenta o texto embutido; se não houver, desenha cada
   página e passa para o OCR. */
export async function lerArquivoListao(arquivo: File, aoAndar: AoAndar): Promise<string> {
  if (arquivo.type.startsWith("image/")) {
    aoAndar({ fase: "ocr", pagina: 1, totalPaginas: 1, pct: 0, recado: "Lendo a imagem…" });
    return await ocrDeImagens([await bitmapDoArquivo(arquivo)], aoAndar);
  }

  aoAndar({ fase: "abrindo", pagina: 0, totalPaginas: 0, pct: 0, recado: "Abrindo o arquivo…" });
  const pdfjs = await carregarPdfjs();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  const total = doc.numPages;

  /* ---- 1) tem texto dentro? ---- */
  aoAndar({ fase: "texto", pagina: 0, totalPaginas: total, pct: 0, recado: "Vendo se o PDF já tem texto…" });
  let textoEmbutido = "";
  for (let p = 1; p <= total; p++) {
    const pagina = await doc.getPage(p);
    const tc = await pagina.getTextContent();
    textoEmbutido += "\n" + linhasPorPosicao(tc.items);
  }
  if (textoEmbutido.replace(/\s/g, "").length >= MINIMO_TEXTO_POR_PAGINA * total) {
    aoAndar({ fase: "pronto", pagina: total, totalPaginas: total, pct: 100, recado: "PDF com texto: leitura exata, sem OCR." });
    return textoEmbutido;
  }

  /* ---- 2) é escaneado: desenha e passa no OCR ---- */
  const trabalhador = await abrirOcr();
  let saida = "";
  try {
    for (let p = 1; p <= total; p++) {
      const pagina = await doc.getPage(p);
      const vp = pagina.getViewport({ scale: ESCALA });
      const tela = document.createElement("canvas");
      tela.width = Math.floor(vp.width);
      tela.height = Math.floor(vp.height);
      const ctx = tela.getContext("2d");
      if (!ctx) throw new Error("O navegador não deixou desenhar a página.");
      // fundo branco: página escaneada em preto e branco fica com buraco sem isso
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, tela.width, tela.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;

      aoAndar({ fase: "ocr", pagina: p, totalPaginas: total, pct: 0, recado: `Lendo a página ${p} de ${total}…` });
      const r = await trabalhador.recognize(tela);
      saida += "\n" + (r?.data?.text || "");

      // devolve a memória: são ~32 MB por página nesse tamanho
      tela.width = 0; tela.height = 0;
      pagina.cleanup?.();
      aoAndar({ fase: "ocr", pagina: p, totalPaginas: total, pct: 100, recado: `Página ${p} de ${total} lida.` });
    }
  } finally {
    await trabalhador.terminate().catch(() => {});
  }

  aoAndar({ fase: "pronto", pagina: total, totalPaginas: total, pct: 100, recado: "Leitura concluída." });
  return saida;
}

async function bitmapDoArquivo(f: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(f);
  const tela = document.createElement("canvas");
  tela.width = bmp.width; tela.height = bmp.height;
  tela.getContext("2d")?.drawImage(bmp, 0, 0);
  return tela;
}

async function ocrDeImagens(telas: HTMLCanvasElement[], aoAndar: AoAndar): Promise<string> {
  const trabalhador = await abrirOcr();
  let saida = "";
  try {
    for (let i = 0; i < telas.length; i++) {
      aoAndar({ fase: "ocr", pagina: i + 1, totalPaginas: telas.length, pct: 0, recado: `Lendo a imagem ${i + 1}…` });
      const r = await trabalhador.recognize(telas[i]);
      saida += "\n" + (r?.data?.text || "");
    }
  } finally {
    await trabalhador.terminate().catch(() => {});
  }
  aoAndar({ fase: "pronto", pagina: telas.length, totalPaginas: telas.length, pct: 100, recado: "Leitura concluída." });
  return saida;
}

/* Abre o OCR apontando para os arquivos do próprio site.

   workerBlobURL: false é obrigatório aqui. Ligado (que é o padrão), o
   tesseract.js embrulha o worker num endereço blob:, e a política de
   segurança do SIGEP só permite 'self' — o navegador barraria o worker e o
   OCR nunca começaria. */
async function abrirOcr() {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    workerBlobURL: false,
  });
  /* O listão é uma tabela de texto corrido: dizer isso ao OCR evita que ele
     tente adivinhar colunas e embaralhe a ordem das células. */
  await worker.setParameters({ preserve_interword_spaces: "1" });
  return worker;
}

/* Reconstrói as linhas de um PDF com texto a partir da posição de cada
   pedaço: o pdf.js entrega fragmentos soltos, e sem juntar por altura o
   texto sai fora de ordem. */
function linhasPorPosicao(itens: any[]): string {
  const linhas = new Map<number, { x: number; s: string }[]>();
  for (const it of itens) {
    if (!it?.str) continue;
    const y = Math.round(it.transform[5]);
    if (!linhas.has(y)) linhas.set(y, []);
    linhas.get(y)!.push({ x: it.transform[4], s: it.str });
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, itens2]) => itens2.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim())
    .join("\n");
}
