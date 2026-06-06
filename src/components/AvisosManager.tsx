"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Inbox } from "lucide-react";
import SlideOver from "@/components/SlideOver";

export type Aviso = {
  id: string;
  texto: string;
  cor: string;
  validade: string | null;
};

const CORES: Record<string, { rotulo: string; classe: string }> = {
  critico: { rotulo: "Crítico", classe: "border-red-500/30 bg-red-500/10 text-red-200" },
  atencao: { rotulo: "Atenção", classe: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  info: { rotulo: "Informativo", classe: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
};

export default function AvisosManager({ inicial }: { inicial: Aviso[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Aviso | null>(null);
  const [texto, setTexto] = useState("");
  const [cor, setCor] = useState("info");
  const [validade, setValidade] = useState("");
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setEditando(null);
    setTexto(""); setCor("info"); setValidade("");
    setAberto(true);
  }
  function abrirEdicao(a: Aviso) {
    setEditando(a);
    setTexto(a.texto); setCor(a.cor); setValidade(a.validade ?? "");
    setAberto(true);
  }

  async function salvar() {
    if (!texto.trim()) return;
    setSalvando(true);
    const url = editando ? `/api/avisos/${editando.id}` : "/api/avisos";
    const metodo = editando ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, cor, validade }),
      });
      const a = await res.json();
      setSalvando(false);
      if (!res.ok) return;
      if (editando) {
        setLista((l) => l.map((x) => (x.id === a.id ? a : x)));
      } else {
        setLista((l) => [a, ...l]);
      }
      setAberto(false);
      router.refresh();
    } catch {
      setSalvando(false);
    }
  }

  async function remover(a: Aviso) {
    if (!confirm("Remover este aviso?")) return;
    setLista((l) => l.filter((x) => x.id !== a.id));
    await fetch(`/api/avisos/${a.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#94A3B8]">
          Avisos aparecem no banner do dashboard até a validade ou remoção.
        </p>
        <button
          onClick={abrirNovo}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Novo aviso
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-[#0F1B2D] py-16 text-center">
          <Inbox className="h-10 w-10 text-[#94A3B8]/40" />
          <p className="text-sm text-[#94A3B8]">Nenhum aviso cadastrado.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => {
            const c = CORES[a.cor] ?? CORES.info;
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${c.classe}`}
              >
                <span className="rounded bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {c.rotulo}
                </span>
                <span className="flex-1 text-sm text-white/90">{a.texto}</span>
                {a.validade && (
                  <span className="text-xs text-[#94A3B8]">até {a.validade}</span>
                )}
                <button onClick={() => abrirEdicao(a)} className="rounded p-1.5 hover:bg-white/10" aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remover(a)} className="rounded p-1.5 hover:bg-white/10" aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SlideOver
        aberto={aberto}
        titulo={editando ? "Editar aviso" : "Novo aviso"}
        onFechar={() => setAberto(false)}
      >
        <label className="mb-1 block text-sm font-medium text-white">Texto</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Ex.: Reunião de comando sexta às 14h."
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        />

        <label className="mb-1 block text-sm font-medium text-white">Cor / nível</label>
        <select
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        >
          <option value="info">Informativo (azul)</option>
          <option value="atencao">Atenção (amarelo)</option>
          <option value="critico">Crítico (vermelho)</option>
        </select>

        <label className="mb-1 block text-sm font-medium text-white">
          Validade (opcional)
        </label>
        <input
          type="date"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
          className="mb-1 w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        />
        <p className="mb-5 text-xs text-[#94A3B8]">
          Sem data, o aviso fica até ser removido.
        </p>

        <button
          onClick={salvar}
          disabled={salvando || !texto.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] py-2.5 font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editando ? "Salvar alterações" : "Criar aviso"}
        </button>
      </SlideOver>
    </div>
  );
}
