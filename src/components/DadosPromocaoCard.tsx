"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { avisar } from "@/components/Avisos";

/* =========================================================================
   DADOS PARA PROMOÇÃO — seção da ficha da praça (src/lib/dadosPromocao.ts)

   O que a Planilha Padrão precisa e o sistema não tem em outro lugar: BG de
   cada promoção, cursos de carreira com nota, elogios, medalhas, conceito.
   Preenche-se uma vez (ou vem da planilha de agosto/2026, importada no
   painel de Promoções) e toda promoção puxa daqui.

   O P/1 edita; o próprio militar só vê — e pode avisar o P/1 se algo
   estiver errado antes de a planilha subir.
   ========================================================================= */

type Campo = { chave: string; rotulo: string; dica?: string; grupo: "promoções" | "cursos" | "outros" };
type Resposta = {
  dados: Record<string, string>; campos: Campo[]; podeEditar: boolean;
  fonte: string | null; atualizadoEm: string | null; atualizadoPor: string | null;
};

const GRUPOS: { id: Campo["grupo"]; titulo: string }[] = [
  { id: "promoções", titulo: "Promoções (data e BG)" },
  { id: "cursos", titulo: "Cursos" },
  { id: "outros", titulo: "Elogios, medalhas e conceito" },
];

export default function DadosPromocaoCard({ efetivoId }: { efetivoId: string }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Record<string, string> | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/efetivo/${encodeURIComponent(efetivoId)}/promocao`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setErro(d?.error || "Não foi possível carregar."); return; }
      setR(d);
    } catch { setErro("Sem conexão com o servidor."); }
  }, [efetivoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    if (!editando) return;
    setGravando(true);
    try {
      const res = await fetch(`/api/efetivo/${encodeURIComponent(efetivoId)}/promocao`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dados: editando }),
      });
      const d = await res.json();
      if (!res.ok) { avisar(d?.error || "Não foi possível gravar.", "erro"); return; }
      avisar("Dados para Promoção gravados.", "sucesso");
      setEditando(null);
      await carregar();
    } catch { avisar("Sem conexão com o servidor.", "erro"); }
    finally { setGravando(false); }
  };

  if (erro) return null;   // sem acesso ou falha: a ficha segue sem a seção

  const vazios = r ? r.campos.filter((c) => !r.dados[c.chave]).length : 0;

  return (
    <section className="ui-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold uppercase tracking-wider text-[#D4AF37]">
          <span className="h-5 w-1.5 rounded bg-[#D4AF37]" />
          Dados para Promoção
        </h2>
        {r && vazios > 0 && !editando && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">{vazios} em branco</span>
        )}
        {r?.podeEditar && !editando && (
          <button onClick={() => setEditando({ ...r.dados })}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        {editando && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setEditando(null)} disabled={gravando}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#cbd5e1] hover:bg-white/5">
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button onClick={salvar} disabled={gravando}
              className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
              {gravando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
            </button>
          </div>
        )}
      </div>

      <p className="mb-4 text-xs text-[#94A3B8]">
        Vai para a Planilha Padrão em toda promoção. O que o histórico e as certidões já mostram continua valendo
        (ex.: um curso que o histórico nomeia não some por um &quot;S/A&quot; aqui).
      </p>

      {!r ? (
        <p className="flex items-center gap-2 text-sm text-[#94A3B8]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map((g) => (
            <div key={g.id}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6f82a0]">{g.titulo}</p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-4">
                {r.campos.filter((c) => c.grupo === g.id).map((c) => (
                  <div key={c.chave} className="border-b border-white/5 pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{c.rotulo}</p>
                    {editando ? (
                      g.id === "promoções" || c.chave === "cursos" ? (
                        <textarea rows={2} value={editando[c.chave] || ""} placeholder={c.dica}
                          onChange={(e) => setEditando({ ...editando, [c.chave]: e.target.value })}
                          className="mt-1 w-full rounded border border-white/10 bg-[#0b1626] px-2 py-1 text-sm text-white placeholder-[#4b5d7a] outline-none focus:border-[#D4AF37]/50" />
                      ) : (
                        <input value={editando[c.chave] || ""} placeholder={c.dica}
                          onChange={(e) => setEditando({ ...editando, [c.chave]: e.target.value })}
                          className="mt-1 w-full rounded border border-white/10 bg-[#0b1626] px-2 py-1 text-sm text-white placeholder-[#4b5d7a] outline-none focus:border-[#D4AF37]/50" />
                      )
                    ) : (
                      <p className="mt-0.5 whitespace-pre-line text-[15px] font-medium text-white">
                        {r.dados[c.chave] || <span className="text-[#4b5d7a]">—</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {r.atualizadoEm && (
            <p className="text-[11px] text-[#6f82a0]">
              {r.fonte || "Atualizado"} · {new Date(r.atualizadoEm).toLocaleDateString("pt-BR")}
              {r.atualizadoPor ? ` · por ${r.atualizadoPor}` : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
