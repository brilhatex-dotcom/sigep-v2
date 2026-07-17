import { lerPermutas } from "@/lib/permutaPedidos";
import { conferirToken, dadosVerificacao } from "@/lib/permutaVerif";

export const dynamic = "force-dynamic";

/* Página PÚBLICA de verificação da permuta (destino dos QR Codes).
   Não exige login. Mostra só dados NÃO sensíveis e o resultado do lacre:
   recalcula o token do registro ATUAL e compara com o token do QR. */

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "—";
}
function dataHora(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0a1220", color: "#e6edf7", fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", padding: "24px 16px" };
const card: React.CSSProperties = { width: "100%", maxWidth: 560, background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 16, padding: 22 };
const rot: React.CSSProperties = { fontSize: 12, color: "#8fa3bf", marginBottom: 2 };
const val: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 };

export default async function VerificarPermutaPage({
  params, searchParams,
}: {
  params: { protocolo: string };
  searchParams: { t?: string };
}) {
  const protocolo = decodeURIComponent(params.protocolo || "");
  const token = searchParams.t || "";

  const permutas = await lerPermutas();
  const p = permutas.find((x) => (x.protocolo || "") === protocolo);

  const encontrada = !!p;
  const temToken = !!token;
  const confere = encontrada && temToken && conferirToken(p!, token);
  const d = p ? dadosVerificacao(p) : null;
  const status: "nao_encontrada" | "integro" | "divergente" | "localizado" =
    !encontrada ? "nao_encontrada" : temToken ? (confere ? "integro" : "divergente") : "localizado";

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.5 }}>SIGEP · 18º BPM</div>
          <div style={{ fontSize: 12, color: "#8fa3bf" }}>Verificação de autenticidade — Permuta</div>
        </div>

        {status === "nao_encontrada" && (
          <div style={{ background: "#2a1414", border: "1px solid #7a1f1f", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>❓</div>
            <div style={{ fontWeight: 700, color: "#ffb3b3", marginTop: 6 }}>Permuta não encontrada</div>
            <div style={{ fontSize: 13, color: "#e6b3b3", marginTop: 4 }}>Nenhum registro para o protocolo <b>{protocolo || "—"}</b>. Confira o número (ex.: PER-2026-000245).</div>
          </div>
        )}

        {status === "integro" && (
          <div style={{ background: "#10301f", border: "1px solid #235b3c", borderRadius: 12, padding: 14, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 30 }}>✅</div>
            <div style={{ fontWeight: 800, color: "#9fe6bd", marginTop: 4 }}>Documento autêntico e íntegro</div>
            <div style={{ fontSize: 12.5, color: "#bfe6cf", marginTop: 4 }}>O lacre confere: o documento impresso não foi alterado depois da assinatura.</div>
          </div>
        )}

        {status === "divergente" && (
          <div style={{ background: "#3a2f10", border: "1px solid #7a4d12", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 30 }}>⚠️</div>
            <div style={{ fontWeight: 800, color: "#ffe9a8", marginTop: 4 }}>O documento impresso não confere</div>
            <div style={{ fontSize: 13, color: "#f3df9d", marginTop: 6 }}>O código do QR não bate com o registro atual — o papel pode ter sido <b>alterado depois de impresso</b>. Abaixo está o <b>registro oficial</b> do sistema.</div>
          </div>
        )}

        {status === "localizado" && (
          <div style={{ background: "#12233f", border: "1px solid #2b3f63", borderRadius: 12, padding: 14, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 30 }}>🔎</div>
            <div style={{ fontWeight: 800, color: "#bcd2ff", marginTop: 4 }}>Registro oficial localizado</div>
            <div style={{ fontSize: 12.5, color: "#a9c0e6", marginTop: 4 }}>Estes são os dados oficiais desta permuta no sistema. Para conferir um documento impresso, use o QR Code da folha.</div>
          </div>
        )}

        {d && (
          <>
            <div style={rot}>Protocolo</div>
            <div style={val}>{d.protocolo}</div>

            <div style={rot}>Solicitante</div>
            <div style={val}>{d.solicitante}{d.assinaturaSolicitante ? ` · assinou em ${dataHora(d.assinaturaSolicitante)}` : ""}</div>

            <div style={rot}>Solicitado</div>
            <div style={val}>{d.solicitado}{d.assinaturaSolicitado ? ` · assinou em ${dataHora(d.assinaturaSolicitado)}` : ""}</div>

            <div style={rot}>Datas</div>
            <div style={val}>Permuta: {dBR(d.dataPermuta)} · Retorno: {dBR(d.dataRetorno)}</div>

            {d.parecerP1 && (
              <>
                <div style={rot}>Parecer do P/1</div>
                <div style={val}>{d.parecerP1.favoravel === false ? "Não favorável" : "Favorável"} — {d.parecerP1.cargo ? d.parecerP1.cargo + " " : ""}{d.parecerP1.nome} · {dataHora(d.parecerP1.em)}</div>
              </>
            )}

            {d.visto && (
              <>
                <div style={rot}>Visto do Subcomandante</div>
                <div style={val}>{d.visto.sentido} — {d.visto.nome} · {dataHora(d.visto.em)}</div>
              </>
            )}

            <div style={rot}>Situação</div>
            <div style={{ ...val, color: d.estado === "autorizada" ? "#9fe6bd" : d.estado === "nao_autorizada" ? "#ffb3b3" : "#f3df9d" }}>{d.decisao}</div>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a href="/verificar" style={{ fontSize: 13, color: "#D4AF37", textDecoration: "none" }}>← Verificar outro documento</a>
        </div>

        <div style={{ fontSize: 11, color: "#6f82a0", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          Verificação por lacre eletrônico (HMAC-SHA256). Esta página mostra apenas dados administrativos da permuta — sem CPF ou dados bancários (LGPD).
        </div>
      </div>
    </div>
  );
}
