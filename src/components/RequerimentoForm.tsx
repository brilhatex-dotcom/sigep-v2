"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send } from "lucide-react";
import { usaQuadrinhoOutros } from "@/lib/requerimentos";

type Dados = Record<string, string>;

const CAMPOS_PESSOAIS: { key: string; label: string; col?: number }[] = [
  { key: "nomeCompleto", label: "Nome completo", col: 3 },
  { key: "endereco", label: "Endereço", col: 2 },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "municipio", label: "Município" },
  { key: "fone", label: "Fone p/ contato" },
  { key: "dataNasc", label: "Data de nascimento" },
  { key: "dataInclusao", label: "Data de inclusão" },
  { key: "matricula", label: "Matrícula" },
  { key: "postoGrad", label: "Posto/Graduação" },
  { key: "numeroPm", label: "Nº do PM" },
  { key: "tempoServico", label: "Tempo de serviço" },
  { key: "cargoFuncao", label: "Cargo/Função" },
  { key: "estadoCivil", label: "Estado civil" },
  { key: "opmClassificado", label: "OPM classificado" },
  { key: "opmExercicio", label: "OPM em exercício" },
];

export default function RequerimentoForm({
  modalidade,
  modelo,
  inicial,
}: {
  modalidade: string;
  modelo: string;
  inicial: Dados;
}) {
  const router = useRouter();
  const [f, setF] = useState<Dados>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const ehCursos = modelo === "cursos";
  // "OUTROS" puro ou modalidade que cai no quadrinho OUTROS (arma, colete...)
  const ehOutros = usaQuadrinhoOutros(modalidade);

  function set(k: string, v: string) {
    setF((o) => ({ ...o, [k]: v }));
  }

  async function enviar(acao: "rascunho" | "enviar") {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch("/api/requerimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalidade, modelo, acao, dados: f }),
      });
      const d = await res.json().catch(() => ({}));
      setSalvando(false);
      if (!res.ok) { setErro(d.error || "Não foi possível salvar."); return; }
      router.push(`/requerimentos/${d.id}`);
      router.refresh();
    } catch {
      setSalvando(false);
      setErro("Erro de conexão ao salvar.");
    }
  }

  function classeCol(col?: number): string {
    if (col === 3) return "sm:col-span-2 md:col-span-3";
    if (col === 2) return "sm:col-span-2";
    return "";
  }

  return (
    <div className="space-y-5">
      {/* dados pessoais */}
      <section className="ui-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Dados do requerente
        </h2>
        <p className="mb-4 text-[12px] text-[#94A3B8]">
          Os campos vêm da sua ficha. Confira e ajuste o que precisar — fica salvo para os próximos requerimentos.
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
          {CAMPOS_PESSOAIS.map((c) => (
            <div key={c.key} className={classeCol(c.col)}>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                {c.label}
              </label>
              <input
                type="text"
                value={f[c.key] ?? ""}
                onChange={(e) => set(c.key, e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          ))}

          {ehCursos && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">ID</label>
                <input type="text" value={f.idPmmaTxt ?? ""} onChange={(e) => set("idPmmaTxt", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">CPF</label>
                <input type="text" value={f.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">E-mail</label>
                <input type="text" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
            </>
          )}
        </div>
      </section>

      {/* modalidade OUTROS: especificar */}
      {ehOutros && (
        <section className="ui-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Especifique a modalidade (Outros)
          </h2>
          <p className="mb-3 text-[12px] text-[#94A3B8]">
            Sai entre parênteses no documento, ao lado do quadrinho “OUTROS”.
          </p>
          <input type="text" value={f.modalidadeOutros ?? ""} onChange={(e) => set("modalidadeOutros", e.target.value)}
            placeholder="Ex: INSCRIÇÃO NO CAP PM"
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
        </section>
      )}

      {/* amparo legal */}
      <section className="ui-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Amparo legal
        </h2>
        <textarea rows={3} value={f.amparoLegal ?? ""} onChange={(e) => set("amparoLegal", e.target.value)}
          placeholder="Base legal do requerimento (lei, artigo, edital...)"
          className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
      </section>

      {/* informacoes adicionais */}
      <section className="ui-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Informações adicionais
        </h2>
        <textarea rows={4} value={f.infoAdicional ?? ""} onChange={(e) => set("infoAdicional", e.target.value)}
          placeholder="Descreva o que solicita..."
          className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
      </section>

      {/* pagina 2 - so cursos (policial sugere, admin confirma) */}
      {ehCursos && (
        <section className="ui-card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Informações do comandante (pág. 2)
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            Preencha o que souber. O P/1 confere e confirma antes de assinar.
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Conceito/Comportamento militar</label>
              <input type="text" value={f.p2Conceito ?? ""} onChange={(e) => set("p2Conceito", e.target.value)}
                placeholder="Ex: EXCEPCIONAL"
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Situação jurídica / complementares</label>
              <textarea rows={5} value={f.p2Complementares ?? ""} onChange={(e) => set("p2Complementares", e.target.value)}
                placeholder="Última promoção, data de inclusão, situação..."
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
          </div>
        </section>
      )}

      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => enviar("enviar")} disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">
          <Send className="h-4 w-4" /> {salvando ? "Enviando..." : "Enviar ao P/1"}
        </button>
        <button onClick={() => enviar("rascunho")} disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white disabled:opacity-60">
          <Save className="h-4 w-4" /> Salvar rascunho
        </button>
      </div>
    </div>
  );
}
