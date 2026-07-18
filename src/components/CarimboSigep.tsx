/* Carimbo de ASSINATURA ELETRÔNICA do SIGEP. Alternativa à imagem da rubrica e
   ao "em branco (Gov.br)": o próprio sistema estampa um bloco de autenticidade
   com nome, cargo, data e um código derivado do conteúdo. Puramente visual/
   determinístico (mesmo conteúdo => mesmo código), pronto para imprimir. */

// Código curto e estável a partir do texto (hash simples -> base36, 8 chars).
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
  nome, cargo, data, largura = "70mm",
}: {
  nome: string;
  cargo: string;
  data?: string;       // ISO ou texto; se vazio, usa hoje
  largura?: string;
}) {
  const quando = data && /^\d{4}-\d{2}-\d{2}/.test(data)
    ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
    : (data || new Date().toLocaleDateString("pt-BR"));
  const codigo = codigoDe(`${nome}|${cargo}|${quando}`);
  return (
    <div style={{
      width: largura, margin: "0 auto", border: "1px solid #333", borderRadius: 3,
      padding: "1.5mm 2mm", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "7.2pt",
      lineHeight: 1.25, color: "#111", textAlign: "left", background: "#fff",
    }}>
      <div style={{ fontWeight: "bold", fontSize: "7.4pt", marginBottom: "0.5mm" }}>
        ✔ Assinado eletronicamente — SIGEP · 18º BPM
      </div>
      <div style={{ fontWeight: "bold" }}>{(nome || "").toUpperCase()}</div>
      <div>{cargo}{quando ? ` · ${quando}` : ""}</div>
      <div style={{ color: "#555" }}>Autenticação: {codigo}</div>
    </div>
  );
}
