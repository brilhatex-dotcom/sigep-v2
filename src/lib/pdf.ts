import { PDFDocument } from "pdf-lib";

// Une varios PDFs (em Buffer/Uint8Array) num unico PDF, na ordem
// em que sao passados. Usado para gerar o PDF unificado das 8
// certidoes na ordem oficial.
export async function unirPdfs(
  partes: (Buffer | Uint8Array)[]
): Promise<Uint8Array> {
  const final = await PDFDocument.create();
  for (const parte of partes) {
    const doc = await PDFDocument.load(parte);
    const paginas = await final.copyPages(doc, doc.getPageIndices());
    paginas.forEach((p) => final.addPage(p));
  }
  return final.save();
}
