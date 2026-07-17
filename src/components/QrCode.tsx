"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/* QR Code simples (imagem PNG data-URL). Usado nas assinaturas da permuta para
   apontar à página pública de verificação. Não carrega dados pessoais — só a
   URL de verificação (protocolo + token assinado). */
export default function QrCode({ url, size = 72, legenda }: { url: string; size?: number; legenda?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(url, { margin: 0, width: size * 3, errorCorrectionLevel: "M" })
      .then((d) => { if (vivo) setSrc(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [url, size]);
  if (!src) return null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <img src={src} alt="QR de verificação" width={size} height={size} style={{ width: size, height: size, display: "block" }} />
      {legenda ? <span style={{ fontSize: "6pt", color: "#555", lineHeight: 1 }}>{legenda}</span> : null}
    </span>
  );
}
