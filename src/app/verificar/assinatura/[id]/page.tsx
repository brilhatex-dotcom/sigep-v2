import { acharAssinatura, conferirAssinatura } from "@/lib/assinaturaSigep";

export const dynamic = "force-dynamic";

/* Página PÚBLICA de verificação da ASSINATURA AVANÇADA SIGEP (destino do QR nas
   escalas/memorandos). Recalcula o token do registro atual e compara com o do
   QR. Mostra só dados não sensíveis (LGPD). */

const TIPO_ROT: Record<string, string> = {
  memorando_ferias: "Memorando de Férias",
  memorando_lp: "Memorando de Licença-Prêmio",
  escala: "Escala de Serviço",
  escala_semana_cpu: "Escala Semanal do CPU",
};
const PAPEL_ROT: Record<string, string> = { chefe_p1: "Chefe do P/1", cmt: "Comandante do 18º BPM" };

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0a1220", color: "#e6edf7", fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", padding: "24px 16px" };
const card: React.CSSProperties = { width: "100%", maxWidth: 520, background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 16, padding: 22 };
const rot: React.CSSProperties = { fontSize: 12, color: "#8fa3bf", marginBottom: 2 };
const val: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 };

export default async function VerificarAssinaturaPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { t?: string };
}) {
  const id = decodeURIComponent(params.id || "");
  const token = searchParams.t || "";
  const a = await acharAssinatura(id);
  const encontrada = !!a;
  const confere = encontrada && !!token && conferirAssinatura(a!, token);

  return (
    <div style={wrap}>
      <div style={card}>
        <a href="/verificar" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#8fa3bf", border: "1px solid #28395a", borderRadius: 8, padding: "6px 10px", fontSize: 13, textDecoration: "none", marginBottom: 14 }}>← Verificar outro documento</a>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.5 }}>SIGEP · 18º BPM</div>
          <div style={{ fontSize: 12, color: "#8fa3bf" }}>Verificação de assinatura eletrônica</div>
        </div>

        {!encontrada ? (
          <div style={{ background: "#2a1414", border: "1px solid #7a1f1f", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>❓</div>
            <div style={{ fontWeight: 700, color: "#ffb3b3", marginTop: 6 }}>Assinatura não encontrada</div>
            <div style={{ fontSize: 13, color: "#c99", marginTop: 4 }}>Confira o código ({id}) ou leia o QR novamente.</div>
          </div>
        ) : confere ? (
          <>
            <div style={{ background: "#0f2a1a", border: "1px solid #1f7a3f", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ fontWeight: 700, color: "#9fe6bd", marginTop: 6 }}>Assinatura autêntica e íntegra</div>
              <div style={{ fontSize: 13, color: "#8fc6a6", marginTop: 4 }}>Assinado eletronicamente no SIGEP e não alterado depois.</div>
            </div>
            <div style={rot}>Documento</div><div style={val}>{TIPO_ROT[a!.tipo] || a!.tipo}</div>
            <div style={rot}>Assinante</div><div style={val}>{a!.nome} — {PAPEL_ROT[a!.papel] || a!.papel}</div>
            <div style={rot}>Cargo</div><div style={val}>{a!.cargo}</div>
            <div style={rot}>Assinado em</div><div style={val}>{dataHora(a!.em)}</div>
            <div style={rot}>Código</div><div style={{ ...val, fontFamily: "monospace" }}>{a!.id}</div>
          </>
        ) : (
          <div style={{ background: "#2a1414", border: "1px solid #7a1f1f", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div style={{ fontWeight: 700, color: "#ffb3b3", marginTop: 6 }}>Assinatura divergente</div>
            <div style={{ fontSize: 13, color: "#c99", marginTop: 4 }}>O código de verificação não confere — o documento pode ter sido alterado após a assinatura.</div>
          </div>
        )}

        <p style={{ fontSize: 11, color: "#6f82a0", marginTop: 16, lineHeight: 1.6, textAlign: "center" }}>
          Assinatura eletrônica avançada (MP 2.200-2/2001 · Lei 14.063/2020). Verificação por lacre HMAC — sem exibir dados pessoais sensíveis (LGPD).
        </p>
      </div>
    </div>
  );
}
