"use client";

import { useMemo, useState } from "react";

type Linha = {
  id: string;
  quando: string;
  autorNome: string | null;
  autorLogin: string | null;
  acao: string;
  alvoNome: string | null;
  alvo: string | null;
  detalhe: string | null;
  antes: string | null;
  depois: string | null;
  ip: string | null;
  dispositivo: string | null;
  lacrado: boolean;
};
type Integridade = { total: number; verificados: number; ok: boolean; problemas: { id: string; quando: string; motivo: string }[] };

// rotulos amigaveis para as acoes
const ACAO_LABEL: Record<string, string> = {
  login: "Entrou no sistema",
  editar_ficha: "Editou ficha",
  criar_ficha: "Cadastrou militar",
  excluir_ficha: "Excluiu militar",
  criar_joe: "Abriu JOE",
  aprovar_joe: "Aprovou candidato JOE",
  recusar_joe: "Recusou candidato JOE",
  excluir_joe: "Excluiu JOE",
  resetar_senha: "Resetou senha",
  trocar_senha: "Trocou a propria senha",
  promover_admin: "Tornou admin",
  rebaixar_admin: "Removeu admin",
  gerar_logins: "Padronizou logins",
  login_falha: "Senha incorreta",
  login_bloqueado: "Acesso bloqueado",
  permuta_criar: "Permuta solicitada",
  permuta_assinar: "Permuta assinada (concordo)",
  permuta_recusar: "Permuta recusada",
  permuta_parecer: "Permuta — parecer do P/1",
  permuta_visto: "Permuta — visto do Subcmt",
  permuta_cancelar: "Permuta cancelada",
};

function rotuloAcao(a: string): string {
  return ACAO_LABEL[a] || a.replace(/_/g, " ");
}

function corAcao(a: string): string {
  if (a.startsWith("excluir") || a === "rebaixar_admin" || a === "login_falha" || a === "login_bloqueado" || a === "permuta_recusar") return "#e06464";
  if (a.startsWith("criar") || a === "promover_admin" || a.startsWith("aprovar")) return "#46c47e";
  if (a === "login") return "#9fb0c7";
  return "#D4AF37";
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function parseObj(s: string | null): Record<string, any> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export default function AuditoriaClient({ linhas, integridade }: { linhas: Linha[]; integridade?: Integridade }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return linhas;
    return linhas.filter((l) =>
      (l.autorNome || "").toLowerCase().includes(b) ||
      (l.autorLogin || "").toLowerCase().includes(b) ||
      rotuloAcao(l.acao).toLowerCase().includes(b) ||
      (l.alvoNome || "").toLowerCase().includes(b) ||
      (l.detalhe || "").toLowerCase().includes(b) ||
      (l.ip || "").toLowerCase().includes(b) ||
      (l.dispositivo || "").toLowerCase().includes(b)
    );
  }, [busca, linhas]);

  return (
    <div>
      {integridade && (
        integridade.ok ? (
          <div className="mb-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-300">
            🔒 <b>Lacre íntegro</b> — {integridade.verificados} registro(s) verificado(s), nenhum sinal de alteração ou remoção.
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            ⚠️ <b>ALERTA de integridade</b> — {integridade.problemas.length} registro(s) com o lacre quebrado (possível alteração/remoção):
            <ul className="mt-1 list-disc pl-5 text-xs">
              {integridade.problemas.slice(0, 8).map((p) => <li key={p.id}>{dataHora(p.quando)} — {p.motivo}</li>)}
            </ul>
          </div>
        )
      )}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por pessoa, ação, militar, IP..."
        className="mb-4 w-full rounded-lg border border-[#28395a] bg-[#0a1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
      />

      {filtradas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2b3f63] p-8 text-center text-sm text-[#94A3B8]">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtradas.map((l) => {
            const antes = parseObj(l.antes);
            const depois = parseObj(l.depois);
            const temDetalhe = !!(antes || depois || l.detalhe || l.ip || l.dispositivo);
            const expandido = aberto === l.id;
            return (
              <div key={l.id} className="rounded-lg border border-[#1d2c44] bg-[#0F1B2D]">
                <button
                  onClick={() => temDetalhe && setAberto(expandido ? null : l.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  style={{ cursor: temDetalhe ? "pointer" : "default" }}
                >
                  <span className="w-32 shrink-0 text-xs text-[#6f82a0]">{dataHora(l.quando)}</span>
                  <span className="shrink-0 text-sm font-semibold" style={{ color: corAcao(l.acao) }}>
                    {rotuloAcao(l.acao)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[#cdd9ea]">
                    {l.alvoNome ? <>· {l.alvoNome}</> : null}
                    {l.detalhe ? <span className="text-[#94A3B8]"> — {l.detalhe}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-[#94A3B8]">{l.autorNome || l.autorLogin || "—"}</span>
                  {temDetalhe && <span className="shrink-0 text-[#6f82a0]">{expandido ? "▲" : "▼"}</span>}
                </button>

                {expandido && (
                  <div className="border-t border-[#1d2c44] px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
                      <span>📱 <b className="text-[#cdd9ea]">Dispositivo:</b> {l.dispositivo || "—"}</span>
                      <span>🌐 <b className="text-[#cdd9ea]">IP:</b> {l.ip
                        ? <a href={`https://ipinfo.io/${encodeURIComponent(l.ip)}`} target="_blank" rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">{l.ip}</a>
                        : "—"}{l.ip && <span className="text-[#6f82a0]"> (clique p/ localização aproximada)</span>}</span>
                      <span>{l.lacrado ? "🔒 lacrado" : "○ sem lacre (anterior a este recurso)"}</span>
                    </div>
                    {(antes || depois) && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase text-[#e0a3a3]">Antes</p>
                          <CamposObj obj={antes} />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase text-[#9fe6bd]">Depois</p>
                          <CamposObj obj={depois} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CamposObj({ obj }: { obj: Record<string, any> | null }) {
  if (!obj || Object.keys(obj).length === 0) {
    return <p className="text-xs text-[#6f82a0]">—</p>;
  }
  return (
    <ul className="space-y-0.5">
      {Object.entries(obj).map(([k, v]) => (
        <li key={k} className="text-xs">
          <span className="text-[#6f82a0]">{k}:</span>{" "}
          <span className="text-[#cdd9ea]">{v === null || v === "" ? "—" : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}
