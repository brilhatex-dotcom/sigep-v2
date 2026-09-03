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
  passada: number;      // 1 ou 2 (ver DUAS LEITURAS, abaixo)
  pct: number;          // 0 a 100 do trabalho todo
  recado: string;
};

type AoAndar = (p: ProgressoLeitura) => void;

/* ---------------------------------------------- DUAS LEITURAS DO MESMO PAPEL

   O listão é uma TABELA com bordas, e a análise de layout do Tesseract se
   perde nela: em algumas faixas ele lê as células da direita e descarta as da
   esquerda (some a ordem, a barra e o nome), em outras faz o contrário.

   Medido no listão de agosto/2026, que tem 270 promovidos:

     modo 6, texto pronto do Tesseract ......... 224 linhas
     modo 3, linhas remontadas pela posição .... 204 linhas
     as duas juntas ............................ 256 linhas

   Ou seja: o que uma perde a outra costuma achar. Por isso cada página é
   lida duas vezes e as duas leituras vão juntas para o cruzamento, que junta
   pela matrícula (ver lerListaoVarios em promocaoListao.ts). Custa o dobro do
   tempo, mas é uma tarefa de três vezes por ano — e linha perdida aqui é
   policial que fica sem ser promovido. */
const MODO_TEXTO = "6";     // bloco único: melhor no texto pronto
const MODO_POSICAO = "3";   // automático: acha mais palavras, ordem ruim

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

/* Lê o arquivo e devolve UMA OU DUAS versões do mesmo texto (ver acima).
   Quem chama manda as duas para o servidor, que junta. */
export async function lerArquivoListao(arquivo: File, aoAndar: AoAndar): Promise<string[]> {
  if (arquivo.type.startsWith("image/")) {
    return await ocrDeTelas([await telaDoArquivo(arquivo)], aoAndar);
  }

  aoAndar({ fase: "abrindo", pagina: 0, totalPaginas: 0, passada: 0, pct: 0, recado: "Abrindo o arquivo…" });
  const pdfjs = await carregarPdfjs();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  const total = doc.numPages;

  /* ---- 1) tem texto dentro? ---- */
  aoAndar({ fase: "texto", pagina: 0, totalPaginas: total, passada: 0, pct: 0, recado: "Vendo se o PDF já tem texto…" });
  let textoEmbutido = "";
  for (let p = 1; p <= total; p++) {
    const pagina = await doc.getPage(p);
    const tc = await pagina.getTextContent();
    textoEmbutido += "\n" + juntarPorAltura(
      tc.items.filter((i: any) => i?.str).map((i: any) => ({
        t: i.str, x: i.transform[4], y: -i.transform[5], h: Math.abs(i.height || 10),
      }))
    );
  }
  if (textoEmbutido.replace(/\s/g, "").length >= MINIMO_TEXTO_POR_PAGINA * total) {
    aoAndar({ fase: "pronto", pagina: total, totalPaginas: total, passada: 0, pct: 100, recado: "PDF com texto: leitura exata, sem OCR." });
    return [textoEmbutido];
  }

  /* ---- 2) é escaneado: desenha cada página e lê duas vezes ---- */
  const telas: HTMLCanvasElement[] = [];
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
    pagina.cleanup?.();
    telas.push(tela);
  }
  return await ocrDeTelas(telas, aoAndar);
}

async function telaDoArquivo(f: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(f);
  const tela = document.createElement("canvas");
  tela.width = bmp.width; tela.height = bmp.height;
  tela.getContext("2d")?.drawImage(bmp, 0, 0);
  return tela;
}

/* As duas passadas de OCR, na mesma ordem de página. */
async function ocrDeTelas(telas: HTMLCanvasElement[], aoAndar: AoAndar): Promise<string[]> {
  const trabalhador = await abrirOcr();
  const total = telas.length;
  const totalPassos = total * 2;
  let passo = 0;
  let porTexto = "";
  let porPosicao = "";

  try {
    // passada 1: o texto pronto do Tesseract, em modo de bloco único
    await trabalhador.setParameters({ tessedit_pageseg_mode: MODO_TEXTO as any });
    for (let i = 0; i < total; i++) {
      passo++;
      aoAndar({
        fase: "ocr", pagina: i + 1, totalPaginas: total, passada: 1,
        pct: Math.round((passo / totalPassos) * 100),
        recado: `Leitura 1 de 2 — página ${i + 1} de ${total}…`,
      });
      const r = await trabalhador.recognize(telas[i]);
      porTexto += "\n" + (r?.data?.text || "");
    }

    // passada 2: as palavras com a posição, para remontar as linhas na mão
    await trabalhador.setParameters({ tessedit_pageseg_mode: MODO_POSICAO as any });
    for (let i = 0; i < total; i++) {
      passo++;
      aoAndar({
        fase: "ocr", pagina: i + 1, totalPaginas: total, passada: 2,
        pct: Math.round((passo / totalPassos) * 100),
        recado: `Leitura 2 de 2 — página ${i + 1} de ${total}…`,
      });
      const r: any = await trabalhador.recognize(telas[i], {}, { text: false, blocks: true });
      porPosicao += "\n" + juntarPorAltura(palavrasDe(r));
      // devolve a memória: são dezenas de MB por página nesse tamanho
      telas[i].width = 0; telas[i].height = 0;
    }
  } finally {
    await trabalhador.terminate().catch(() => {});
  }

  aoAndar({ fase: "pronto", pagina: total, totalPaginas: total, passada: 2, pct: 100, recado: "Leitura concluída." });
  return [porTexto, porPosicao];
}

/* Tira as palavras (com a caixa de cada uma) do resultado do Tesseract. */
function palavrasDe(r: any): { t: string; x: number; y: number; h: number }[] {
  const saida: { t: string; x: number; y: number; h: number }[] = [];
  for (const b of r?.data?.blocks || [])
    for (const p of b?.paragraphs || [])
      for (const l of p?.lines || [])
        for (const w of l?.words || []) {
          const t = (w?.text || "").trim();
          if (!t || !w.bbox) continue;
          saida.push({ t, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 });
        }
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

/* Remonta as linhas a partir da posição de cada pedaço de texto.

   Serve para os dois casos: as palavras que o OCR devolve com a caixa de cada
   uma, e os fragmentos soltos que o pdf.js entrega num PDF com texto. Nos
   dois, sem juntar por altura o texto sai fora de ordem — que é exatamente o
   defeito que faz linha de promoção se perder.

   A tolerância sai da altura MEDIANA das palavras da própria página, em vez
   de um número fixo: assim funciona igual num escaneamento de 200 ou de
   400 dpi. */
function juntarPorAltura(itens: { t: string; x: number; y: number; h: number }[]): string {
  const ps = itens.filter((i) => i.t.trim());
  if (!ps.length) return "";

  const alturas = ps.map((p) => p.h).sort((a, b) => a - b);
  const tolerancia = Math.max(6, alturas[Math.floor(alturas.length / 2)] * 0.6);

  ps.sort((a, b) => a.y - b.y);
  const linhas: (typeof ps)[] = [];
  let atual = [ps[0]];
  for (let i = 1; i < ps.length; i++) {
    if (Math.abs(ps[i].y - atual[atual.length - 1].y) <= tolerancia) atual.push(ps[i]);
    else { linhas.push(atual); atual = [ps[i]]; }
  }
  linhas.push(atual);

  return linhas
    .map((l) => l.sort((a, b) => a.x - b.x).map((p) => p.t).join(" ").replace(/\s+/g, " ").trim())
    .join("\n");
}
