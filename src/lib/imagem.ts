/* Padronização de logos/brasões enviados pelas unidades.
   Cada lugar pode subir seu próprio símbolo, mas os arquivos vêm em tamanhos
   e proporções variados. Aqui usamos a SEDE como molde: encaixamos a imagem
   dentro da mesma "caixa" que a sede usa para cada brasão (contain — mantém a
   proporção, NUNCA estica/distorce) e centralizamos, gerando um PNG de tamanho
   uniforme. Assim, mesmo uploads torto/gigantes saem padronizados. */

// Caixa-molde de cada brasão do cabeçalho (proporção da sede), em pixels.
// Mesma razão largura×altura que a folha renderiza (mm), numa resolução boa
// para impressão. pmma 26×22mm · ma 16mm alt (largura livre) · bpm 22×22mm.
export const MOLDE_BRASAO: Record<string, { w: number; h: number }> = {
  pmma: { w: 364, h: 308 }, // 26×22 mm  (~14px/mm)
  ma:   { w: 420, h: 224 }, // faixa central (armas do Estado)
  bpm:  { w: 308, h: 308 }, // 22×22 mm  (quadrado)
};

/* Encaixa `dataUrl` na caixa alvo (contain, centralizado, fundo transparente)
   e devolve um PNG data URL padronizado. Se algo falhar, devolve o original. */
export function padronizarImagem(dataUrl: string, alvoW: number, alvoH: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (!dataUrl || typeof document === "undefined") return resolve(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = alvoW; canvas.height = alvoH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          // contain: escala pela menor razão para caber inteiro na caixa
          const escala = Math.min(alvoW / img.width, alvoH / img.height);
          const w = Math.max(1, Math.round(img.width * escala));
          const h = Math.max(1, Math.round(img.height * escala));
          const x = Math.round((alvoW - w) / 2);
          const y = Math.round((alvoH - h) / 2);
          ctx.imageSmoothingEnabled = true;
          (ctx as any).imageSmoothingQuality = "high";
          ctx.clearRect(0, 0, alvoW, alvoH);
          ctx.drawImage(img, x, y, w, h);
          resolve(canvas.toDataURL("image/png"));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

/* Padroniza um brasão do cabeçalho pela chave (pmma/ma/bpm), usando o molde
   da sede. Chaves desconhecidas voltam inalteradas. */
export function padronizarBrasao(chave: string, dataUrl: string): Promise<string> {
  const m = MOLDE_BRASAO[chave];
  if (!m) return Promise.resolve(dataUrl);
  return padronizarImagem(dataUrl, m.w, m.h);
}
