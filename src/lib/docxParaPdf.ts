/* =========================================================================
   WORD -> PDF NO NAVEGADOR

   O servidor (Vercel) não tem um Word/LibreOffice para converter. Então o PDF
   é montado aqui, na máquina de quem clica: o .docx é desenhado na página
   (docx-preview), cada folha vira imagem (html-to-image, que usa o próprio
   motor do navegador — o texto fica exatamente onde está na tela) e vão para
   um PDF A4 (jsPDF). Os dados não saem do sistema para serviço nenhum.

   Dois acertos para o desenho bater com o Word nos modelos da PMMA:
     · o RECUO das tabelas (tblInd, negativo nos formulários: a tabela entra
       na margem) — a biblioteca ignora; lemos do próprio .docx e aplicamos;
     · imagem SOLTA (o brasão) que cai em cima do texto de baixo — sobe o
       quanto encostou.

   As bibliotecas só carregam no clique (import dinâmico).
   ========================================================================= */

const TWIP_PX = 96 / 1440;

// o recuo de cada tabela, na ordem em que aparecem no documento
async function recuosDasTabelas(buf: ArrayBuffer): Promise<number[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) || "";
  const out: number[] = [];
  const re = /<w:tbl>([\s\S]*?)<w:tblGrid/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const ind = m[1].match(/<w:tblInd w:w="(-?\d+)"/);
    out.push(ind ? Number(ind[1]) : 0);
  }
  return out;
}

function acertarDesenho(raiz: HTMLElement, recuos: number[]) {
  /* O CSS global do sistema (Tailwind) limita toda imagem a max-width:100%.
     O brasão do Word fica numa caixa de largura zero (imagem solta) e, com
     esse limite, encolhia até sumir. Dentro da folha, imagem tem o tamanho
     que o Word deu. */
  raiz.querySelectorAll<HTMLElement>("section.docx img, section.docx svg").forEach((el) => {
    el.style.maxWidth = "none";
    el.style.display = "inline-block";
  });
  const tabelas = Array.from(raiz.querySelectorAll<HTMLTableElement>("section.docx table"));
  if (tabelas.length === recuos.length) {
    tabelas.forEach((t, i) => { if (recuos[i]) t.style.marginLeft = `${recuos[i] * TWIP_PX}px`; });
  }
  // imagem solta encostando no texto logo abaixo: sobe o que sobrepôs
  for (const img of Array.from(raiz.querySelectorAll<HTMLImageElement>("section.docx img"))) {
    const caixa = img.parentElement;
    if (!caixa || getComputedStyle(caixa).position !== "relative" || caixa.offsetHeight > 0) continue;
    const p = img.closest("p");
    let prox = p?.nextElementSibling as HTMLElement | null;
    while (prox && !(prox.textContent || "").trim()) prox = prox.nextElementSibling as HTMLElement | null;
    if (!prox) continue;
    const sobra = img.getBoundingClientRect().bottom - prox.getBoundingClientRect().top;
    if (sobra > 0) img.style.top = `${-(sobra + 4)}px`;
  }
}

/* `origem`: o endereço do .docx (GET) ou o próprio arquivo já baixado (ex.: o
   memorando, que sai de um POST). */
export async function baixarDocxComoPdf(origem: string | Blob, nomeArquivo: string): Promise<void> {
  let buf: ArrayBuffer;
  if (typeof origem === "string") {
    const r = await fetch(origem);
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      throw new Error(d?.error || "Não foi possível obter o documento.");
    }
    buf = await r.arrayBuffer();
  } else {
    buf = await origem.arrayBuffer();
  }
  const [{ renderAsync }, { toJpeg }, { jsPDF }, recuos] = await Promise.all([
    import("docx-preview"),
    import("html-to-image"),
    import("jspdf"),
    recuosDasTabelas(buf),
  ]);

  // folha fora da tela, para desenhar sem aparecer
  const raiz = document.createElement("div");
  raiz.style.cssText = "position:fixed;left:-20000px;top:0;width:1000px;background:#fff;";
  document.body.appendChild(raiz);
  try {
    await renderAsync(new Blob([buf]), raiz, undefined, {
      // imagens como data: (o CSP do sistema não deixa ler blob: por fetch)
      useBase64URL: true,
      inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true,
      ignoreWidth: false, ignoreHeight: false, renderHeaders: true, renderFooters: true,
    });
    await new Promise((ok) => setTimeout(ok, 300)); // imagens/fontes assentarem
    acertarDesenho(raiz, recuos);

    const folhas = Array.from(raiz.querySelectorAll<HTMLElement>("section.docx"));
    if (!folhas.length) throw new Error("O documento não tem páginas.");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let i = 0; i < folhas.length; i++) {
      const img = await toJpeg(folhas[i], { pixelRatio: 2, backgroundColor: "#ffffff", quality: 0.92, cacheBust: false, skipFonts: true });
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(img, "JPEG", 0, 0, 210, 297);
    }
    pdf.save(nomeArquivo.endsWith(".pdf") ? nomeArquivo : `${nomeArquivo}.pdf`);
  } finally {
    raiz.remove();
  }
}
