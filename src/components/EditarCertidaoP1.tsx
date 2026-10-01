"use client";

import { useState } from "react";
import { X, Loader2, Save, Eye, RotateCcw } from "lucide-react";
import type { CamposCertidao } from "@/lib/certidaoP1Db";

/* Editar a certidão/declaração do P/1 antes de gerar: tudo o que identifica o
   militar (vem da ficha, mas pode ter erro ou faltar) e a data. O texto que
   atesta a situação é fixo. O número só o P/1 troca. "Voltar aos dados da
   ficha" apaga os ajustes. */

type Props = {
  titulo: string;
  campos: CamposCertidao;
  ano: number;
  podeNumero: boolean;
  ajustado: boolean;
  onSalvar: (campos: CamposCertidao, depois?: "visualizar") => Promise<string | null>;
  onRestaurar: () => Promise<void>;
  onFechar: () => void;
};

const entrada =
  "w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50";

function Campo({ rotulo, dica, children, largo }: { rotulo: string; dica?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <label className={`block ${largo ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{rotulo}</span>
      {children}
      {dica && <span className="mt-0.5 block text-[11px] text-[#94A3B8]">{dica}</span>}
    </label>
  );
}

export default function EditarCertidaoP1({ titulo, campos, ano, podeNumero, ajustado, onSalvar, onRestaurar, onFechar }: Props) {
  const [c, setC] = useState<CamposCertidao>(campos);
  const [salvando, setSalvando] = useState<"" | "salvar" | "ver" | "restaurar">("");
  const [erro, setErro] = useState("");
  const set = <K extends keyof CamposCertidao>(k: K, v: CamposCertidao[K]) => setC((o) => ({ ...o, [k]: v }));

  async function salvar(depois?: "visualizar") {
    setErro("");
    if (!c.nome.trim()) { setErro("O nome não pode ficar em branco."); return; }
    setSalvando(depois ? "ver" : "salvar");
    const e = await onSalvar(c, depois);
    setSalvando("");
    if (e) setErro(e); else onFechar();
  }

  async function restaurar() {
    setSalvando("restaurar");
    await onRestaurar();
    setSalvando("");
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" onClick={onFechar}>
      <div className="mt-8 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0F1B2D] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Editar certidão — {titulo}</h3>
          <button onClick={onFechar} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-xs text-[#94A3B8]">
          Os dados vêm da ficha; o que você mudar aqui vale só para esta certidão. O texto que atesta a
          situação (“NÃO POSSUI registros impeditivos…”) não muda.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome completo" largo dica="Sai com só a inicial maiúscula — menos o nome de guerra.">
            <input value={c.nome} onChange={(e) => set("nome", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Nome de guerra" dica="Sai em NEGRITO e caixa alta dentro do nome.">
            <input value={c.nomeGuerra} onChange={(e) => set("nomeGuerra", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Posto / graduação (por extenso)" dica="Ex.: Major, 1º Tenente, Subtenente.">
            <input value={c.postoExtenso} onChange={(e) => set("postoExtenso", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Matrícula" dica="Em branco: não sai no texto.">
            <input value={c.matricula} onChange={(e) => set("matricula", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Id">
            <input value={c.idPmma} onChange={(e) => set("idPmma", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Quadro (sigla)" dica="Ex.: QOEM. Em branco: o trecho do quadro não sai.">
            <input value={c.quadro} onChange={(e) => set("quadro", e.target.value.toUpperCase())} className={entrada} />
          </Campo>
          <Campo rotulo="Quadro (por extenso)" dica="Ex.: Quadro de Oficiais do Estado Maior.">
            <input value={c.quadroDescricao} onChange={(e) => set("quadroDescricao", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Justiça Federal (item III)" largo>
            <div className="flex flex-wrap gap-4 pt-1 text-sm text-white">
              <label className="inline-flex items-center gap-2">
                <input type="radio" className="accent-[#D4AF37]" checked={c.seisRegioes} onChange={() => set("seisRegioes", true)} />
                1ª à 6ª Região <span className="text-[11px] text-[#94A3B8]">(oficial e subtenente)</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" className="accent-[#D4AF37]" checked={!c.seisRegioes} onChange={() => set("seisRegioes", false)} />
                1ª à 5ª Região <span className="text-[11px] text-[#94A3B8]">(praça)</span>
              </label>
            </div>
          </Campo>
          <Campo rotulo="Portaria citada no texto" largo>
            <input value={c.portaria} onChange={(e) => set("portaria", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo="Data da certidão">
            <input type="date" value={c.data} onChange={(e) => set("data", e.target.value)} className={entrada} />
          </Campo>
          <Campo rotulo={`Número (${ano})`} dica={podeNumero ? "Não pode repetir o de outra certidão do ano." : "A numeração é do P/1."}>
            <input type="number" min={1} value={c.numero} disabled={!podeNumero}
              onChange={(e) => set("numero", Number(e.target.value))} className={`${entrada} disabled:opacity-60`} />
          </Campo>
        </div>

        {erro && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{erro}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {ajustado && (
            <button onClick={restaurar} disabled={!!salvando} title="Apaga os ajustes e volta aos dados da ficha (número e data ficam)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white disabled:opacity-50">
              {salvando === "restaurar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Voltar à ficha
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onFechar} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white">
            Cancelar
          </button>
          <button onClick={() => salvar("visualizar")} disabled={!!salvando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-4 py-2 text-sm font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-50">
            {salvando === "ver" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Salvar e visualizar
          </button>
          <button onClick={() => salvar()} disabled={!!salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
            {salvando === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
