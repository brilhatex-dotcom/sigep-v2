"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

/* =========================================================================
   AvatarUpload — o circulo do cabecalho. Mostra a foto (se houver) ou a
   inicial. Clicar abre o seletor de arquivo; a imagem e redimensionada
   para um quadrado 256x256 no proprio navegador (sem libs) e enviada para
   /api/foto. Ao concluir, a foto aparece na hora.
   ========================================================================= */

const LADO = 256; // tamanho final do lado (quadrado)

async function redimensionarQuadrado(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponivel");
  // recorta o quadrado central e desenha no tamanho final
  ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, LADO, LADO);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("falha ao gerar imagem"))),
      "image/jpeg",
      0.85
    );
  });
}

export default function AvatarUpload({
  efetivoId,
  inicial,
  temFoto,
  podeEditar,
  tamanho = 36,
}: {
  efetivoId: string | null;
  inicial: string;
  temFoto: boolean;
  podeEditar: boolean;
  tamanho?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // versao serve para forcar recarregar a imagem apos trocar
  const [versao, setVersao] = useState(0);
  const [temFotoState, setTemFoto] = useState(temFoto);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fotoSrc = efetivoId && temFotoState ? `/api/foto/${encodeURIComponent(efetivoId)}?v=${versao}` : null;

  const escolher = () => {
    if (!podeEditar || !efetivoId) return;
    inputRef.current?.click();
  };

  const aoSelecionar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!file || !efetivoId) return;

    setErro(null);
    setEnviando(true);
    try {
      const blob = await redimensionarQuadrado(file);
      const fd = new FormData();
      fd.append("foto", blob, "foto.jpg");
      fd.append("efetivoId", efetivoId);

      const r = await fetch("/api/foto", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao enviar."); return; }

      setTemFoto(true);
      setVersao((v: number) => v + 1); // recarrega a imagem
    } catch (err) {
      setErro("Nao foi possivel processar a imagem.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={escolher}
        title={podeEditar ? "Clique para trocar a foto" : ""}
        style={{
          width: tamanho, height: tamanho, borderRadius: "9999px", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(212,175,55,0.15)", color: "#D4AF37",
          fontSize: Math.round(tamanho * 0.4), fontWeight: 700, border: "none",
          cursor: podeEditar ? "pointer" : "default", padding: 0,
        }}
      >
        {fotoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoSrc} alt={inicial} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          inicial
        )}
      </button>

      {enviando && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "9999px",
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 9, color: "#fff",
        }}>...</div>
      )}

      {podeEditar && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={aoSelecionar}
          style={{ display: "none" }}
        />
      )}

      {erro && (
        <div style={{
          position: "absolute", top: tamanho + 6, right: 0, whiteSpace: "nowrap",
          background: "#3a1414", color: "#ffb3b3", border: "1px solid #7a1f1f",
          borderRadius: 6, padding: "4px 8px", fontSize: 11, zIndex: 50,
        }}>{erro}</div>
      )}
    </div>
  );
}
