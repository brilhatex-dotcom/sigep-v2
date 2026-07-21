import QrCode from "@/components/QrCode";

/* Carimbo de ASSINATURA ELETRÔNICA do SIGEP.
   - Sem `assinatura`: carimbo VISUAL (nome, cargo, data e um código estável).
   - Com `assinatura` ({id, token}): assinatura AVANÇADA (assinada com senha),
     mostra QR que aponta para a verificação pública (recalcula o lacre HMAC).
   Base: MP 2.200-2/2001 e Lei 14.063/2020. */

function codigoDe(txt: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < txt.length; i++) {
    const c = txt.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0; h2 = Math.imul(h2, 0x85ebca77) >>> 0;
  }
  const s = (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const p = (s + "00000000").slice(0, 8);
  return `${p.slice(0, 4)}-${p.slice(4, 8)}`;
}

export default function CarimboSigep({
  nome, cargo, data, largura = "70mm", assinatura, escala = 1,
}: {
  nome: string;
  cargo: string;
  data?: string;
  largura?: string;
  assinatura?: { id: string; token: string } | null;
  escala?: number;
}) {
  const e = escala > 0 ? escala : 1;
  const pt = (v: number) => `${(v * e).toFixed(2)}pt`;
  const mm = (v: number) => `${(v * e).toFixed(2)}mm`;
  const quando = data && /^\d{4}-\d{2}-\d{2}/.test(data)
    ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
    : (data || new Date().toLocaleDateString("pt-BR"));
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const qrUrl = assinatura ? `${base}/verificar/assinatura/${encodeURIComponent(assinatura.id)}?t=${encodeURIComponent(assinatura.token)}` : "";
  const codigo = assinatura ? assinatura.id : codigoDe(`${nome}|${cargo}|${quando}`);

  return (
    <div style={{
      width: largura, margin: "0 auto", border: "1px solid #1351b4", borderRadius: 3,
      padding: `${mm(1.5)} ${mm(2)}`, fontFamily: "Arial, Helvetica, sans-serif", fontSize: pt(7.2),
      lineHeight: 1.25, color: "#111", textAlign: "left", background: "#fff",
      display: "flex", gap: mm(2), alignItems: "center",
    }}>
      {assinatura && qrUrl ? <div style={{ flexShrink: 0 }}><QrCode url={qrUrl} size={Math.round(52 * e)} /></div> : null}
      <div>
        <div style={{ fontWeight: "bold", fontSize: pt(7.4), marginBottom: mm(0.5), color: "#1351b4" }}>
          ✔ Assinado eletronicamente — SIGEP · 18º BPM
        </div>
        <div style={{ fontWeight: "bold" }}>{(nome || "").toUpperCase()}</div>
        <div>{cargo}{quando ? ` · ${quando}` : ""}</div>
        <div style={{ color: "#555" }}>{assinatura ? "Autenticação (aponte o QR)" : "Autenticação"}: {codigo}</div>
      </div>
    </div>
  );
}
