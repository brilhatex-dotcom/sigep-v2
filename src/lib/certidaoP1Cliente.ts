/* =========================================================================
   Certidão do P/1 — o que roda NO NAVEGADOR, usado pelo painel do P/1 e pela
   tela "Minhas certidões" do oficial/subtenente.

   A junção do PDF único é feita aqui (pdf-lib), com os arquivos descendo
   direto do R2: pela Vercel não daria (ela corta resposta acima de ~4,5 MB) e
   ainda gastaria a cota de tráfego do banco.
   ========================================================================= */

export function salvarArquivo(dados: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(dados);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function baixarBytes(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `Falha ao baixar (${r.status}).`);
  }
  return r.arrayBuffer();
}

export function urlDocumento(efetivoId: string, formato: "pdf" | "docx", ver = false): string {
  return `/api/promocoes/certidao-p1/documento?efetivoId=${encodeURIComponent(efetivoId)}&formato=${formato}${ver ? "&ver=1" : ""}`;
}

/* Abre uma aba JÁ (no clique), para o navegador não barrar como pop-up, e
   só depois aponta para o documento — quando ele depende de algo assíncrono
   (numerar a certidão, juntar o PDF). */
export function abaReservada(): { ir: (url: string) => void; fechar: () => void } {
  const w = window.open("about:blank", "_blank");
  return {
    ir: (url) => { if (w) w.location.href = url; else window.open(url, "_blank"); },
    fechar: () => { try { w?.close(); } catch { /* já fechada */ } },
  };
}

/* Certidão do P/1 + certidões das regiões que o militar mandou pelo sistema
   (ordem oficial; a Certidão Unificada entra uma vez) + PDFs anexados na
   hora -> um PDF só. */
export async function montarUnificado(efetivoId: string, titulo: string, extras: File[] = []): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const final = await PDFDocument.create();
  const juntar = async (buf: ArrayBuffer, origem: string) => {
    let doc;
    try { doc = await PDFDocument.load(buf, { ignoreEncryption: true }); }
    catch { throw new Error(`${origem} não é um PDF que dê para abrir.`); }
    const paginas = await final.copyPages(doc, doc.getPageIndices());
    paginas.forEach((p) => final.addPage(p));
  };

  const id = encodeURIComponent(efetivoId);
  await juntar(await baixarBytes(urlDocumento(efetivoId, "pdf")), "A certidão do P/1");

  const r = await fetch(`/api/promocoes/certidao-p1/arquivos?efetivoId=${id}`);
  const lista = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(lista.error || "Falha ao buscar as certidões.");
  for (const a of (lista?.arquivos ?? []) as { ordem: number; rotulo: string; url: string }[]) {
    let buf: ArrayBuffer;
    try {
      buf = await baixarBytes(a.url);           // direto do R2
    } catch {
      buf = await baixarBytes(`/api/promocoes/certidao-p1/arquivos?efetivoId=${id}&ordem=${a.ordem}`);
    }
    await juntar(buf, a.rotulo);
  }

  for (const f of extras) await juntar(await f.arrayBuffer(), `O anexo "${f.name}"`);
  final.setTitle(titulo);
  return final.save();
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
