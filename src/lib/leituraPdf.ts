import os from "os";
import path from "path";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { prisma } from "@/lib/prisma";

/* =========================================================================
   TIRAR O TEXTO DE UM PDF DE CERTIDÃO — no servidor, para a conferência.

   O PDF baixado do site do tribunal tem o texto dentro: sai na hora. Mas
   tem policial que tira print da tela do celular e passa no CamScanner (a
   Unificada do Sd F. Ribeiro chegou assim): a página é só uma FOTO. Para
   essas, a leitura da imagem (OCR, o mesmo Tesseract da importação do
   listão, com o português que o SIGEP já serve em /public/ocr).

   O OCR leva uns 3 a 4 segundos por página. Por isso:
     · cada chamada tem um PRAZO — o que não deu tempo fica pendente;
     · o que já foi lido fica GUARDADO por arquivo (tabela certidao_texto),
       e a próxima chamada continua de onde parou, sem reler nada.
   Trocou o arquivo (enviadaEm muda), a leitura guardada não vale mais.
   ========================================================================= */

export type LeituraPdf = { paginas: string[]; porImagem: boolean; incompleto: boolean };

// menos que isso de texto numa página = é imagem
const MINIMO_DE_TEXTO = 80;

let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronto) {
    pronto = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS certidao_texto (
        chave text PRIMARY KEY,
        versao text NOT NULL,
        leitura text NOT NULL,
        lido_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

type Guardada = { paginas: string[]; porImagem: boolean; pendentes: number[] };

async function lerGuardada(chave: string, versao: string): Promise<Guardada | null> {
  try {
    await garantir();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT versao, leitura FROM certidao_texto WHERE chave = $1`, chave);
    if (!rows[0] || rows[0].versao !== versao) return null;
    return JSON.parse(rows[0].leitura);
  } catch { return null; }
}

async function guardar(chave: string, versao: string, g: Guardada): Promise<void> {
  try {
    await garantir();
    await prisma.$executeRawUnsafe(
      `INSERT INTO certidao_texto (chave, versao, leitura) VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO UPDATE SET versao = EXCLUDED.versao, leitura = EXCLUDED.leitura, lido_em = CURRENT_TIMESTAMP`,
      chave, versao, JSON.stringify(g));
  } catch (e) { console.error("[leituraPdf] guardar", e); }
}

/* --------------------------------------------------------------- OCR */

let trabalhador: Promise<any> | null = null;
function ocr(): Promise<any> {
  if (!trabalhador) {
    trabalhador = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("por", 1, {
        langPath: path.join(process.cwd(), "public", "ocr"),
        gzip: true,
        cachePath: os.tmpdir(),
      });
    })().catch((e) => { trabalhador = null; throw e; });
  }
  return trabalhador;
}

/* A foto de cada página: o CamScanner (e quase todo escaneador) grava a
   página como um JPEG inteiro — os bytes do JPEG estão prontos dentro do PDF,
   sem precisar desenhar a página. Pega o maior de cada página (o resto é
   logotipo, marca d'água). Página sem JPEG fica sem leitura. */
async function fotosDasPaginas(pdf: Buffer): Promise<(Uint8Array | null)[]> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  return doc.getPages().map((pagina) => {
    const xo = pagina.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    let maior: Uint8Array | null = null;
    for (const [, ref] of xo ? xo.entries() : []) {
      const s = doc.context.lookup(ref);
      if (!(s instanceof PDFRawStream)) continue;
      if (String(s.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      if (!String(s.dict.get(PDFName.of("Filter")) ?? "").includes("DCTDecode")) continue;
      if (!maior || s.contents.length > maior.length) maior = s.contents;
    }
    return maior;
  });
}

/* ------------------------------------------------------------ leitura */

export async function lerPdfDeCertidao(
  chave: string,
  versao: string,
  baixar: () => Promise<Buffer>,
  prazo: number,   // Date.now() até quando dá para ler imagem nesta chamada
): Promise<LeituraPdf> {
  let g = await lerGuardada(chave, versao);
  let pdf: Buffer | null = null;

  if (!g) {
    pdf = await baixar();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: false });
    const paginas = Array.isArray(text) ? text : [String(text)];
    const pendentes = paginas
      .map((t, i) => (t.replace(/\s/g, "").length < MINIMO_DE_TEXTO ? i : -1))
      .filter((i) => i >= 0);
    g = { paginas, porImagem: false, pendentes };
  }

  if (g.pendentes.length && Date.now() < prazo) {
    try {
      pdf = pdf || (await baixar());
      const fotos = await fotosDasPaginas(pdf);
      const w = await ocr();
      const restam: number[] = [];
      for (const i of g.pendentes) {
        const foto = fotos[i];
        if (!foto) continue;                          // sem foto que dê para ler: fica como está
        if (Date.now() >= prazo) { restam.push(i); continue; }
        const { data } = await w.recognize(Buffer.from(foto));
        g.paginas[i] = String(data?.text || "");
        g.porImagem = true;
      }
      g.pendentes = restam;
    } catch (e) {
      console.error("[leituraPdf] OCR", chave, e);
      g.pendentes = [];                               // não insiste num arquivo que o OCR não abre
    }
  }

  await guardar(chave, versao, g);
  return { paginas: g.paginas, porImagem: g.porImagem, incompleto: g.pendentes.length > 0 };
}
