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
};

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
};

function rotuloAcao(a: string): string {
  return ACAO_LABEL[a] || a.replace(/_/g, " ");
}

function corAcao(a: string): string {
  if (a.startsWith("excluir") || a === "rebaixar_admin") return "#e06464";
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

export default function AuditoriaClient({ linhas }: { linhas: Linha[] }) {
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
      (l.detalhe || "").toLowerCase().includes(b)
    );
  }, [busca, linhas]);

  return (
    <div>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por pessoa, ação, militar..."
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
            const temDetalhe = !!(antes || depois || l.detalhe);
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

                {expandido && (antes || depois) && (
                  <div className="border-t border-[#1d2c44] px-4 py-3">
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
