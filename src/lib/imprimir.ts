/* Impressão/"Salvar em PDF" confiável em qualquer aparelho — inclusive iPad.
   Em vez de window.print() (que no iOS falha dentro de overlays/portais),
   clona só o documento para um iframe limpo e imprime esse iframe. O iOS
   Safari imprime iframe da mesma origem sem os problemas do overlay fixo. */
export function imprimirElemento(
  el: HTMLElement | null,
  opts?: { landscape?: boolean; titulo?: string; estilo?: string },
): void {
  if (!el || typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px", border: "0", opacity: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }

  const size = opts?.landscape ? "A4 landscape" : "A4 portrait";
  const base = typeof location !== "undefined" ? location.origin : "";
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<base href="${base}/">` +
    `<title>${opts?.titulo || "Documento"}</title>` +
    `<style>@page{size:${size};margin:0;} html,body{margin:0;padding:0;background:#fff;} ` +
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
    /* O iframe é limpo: NADA do CSS da página chega aqui. Botão marcado com
       "não imprimir" é controle de tela — num iframe que só existe para
       imprimir, ele nunca deve aparecer. Sem esta linha, a lixeira de apagar
       a linha saía impressa dentro da tabela do documento. */
    `.nao-imprimir,.no-print,#chat-flutuante{display:none !important;}</style>` +
    /* Estilo próprio do documento (ex.: ESTILO_FOLHA). Também não viaja
       sozinho: a tag <style> da página é IRMÃ do elemento clonado, e o clone
       leva só o elemento. Por isso quem chama precisa passá-lo — era o que
       fazia os campos editáveis saírem no papel com o pontilhado da tela. */
    (opts?.estilo ? `<style>${opts.estilo}</style>` : "") +
    `</head><body>${el.outerHTML}</body></html>`,
  );
  doc.close();

  let disparado = false;
  const go = () => {
    if (disparado) return; disparado = true;
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignora */ }
    setTimeout(() => iframe.remove(), 2000);
  };

  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) { setTimeout(go, 200); }
  else {
    let restam = imgs.length;
    const um = () => { if (--restam <= 0) go(); };
    imgs.forEach((im) => { if (im.complete) um(); else { im.onload = um; im.onerror = um; } });
  }
  // rede de segurança: dispara mesmo se algum recurso travar
  setTimeout(go, 2500);
}
