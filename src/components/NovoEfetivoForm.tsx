"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";

type Campo = { key: string; label: string; tipo?: "texto" | "area" };
type Secao = { titulo: string; campos: Campo[] };

const SECOES: Secao[] = [
  {
    titulo: "Identificação e dados funcionais",
    campos: [
      { key: "id", label: "ID PMMA (obrigatório)" },
      { key: "nome", label: "Nome completo" },
      { key: "nomeGuerra", label: "Nome de guerra" },
      { key: "postoGrad", label: "Posto/Graduação" },
      { key: "numeroBarra", label: "Número/Barra" },
      { key: "matricula", label: "Matrícula" },
      { key: "quadro", label: "Quadro" },
      { key: "funcao", label: "Função" },
      { key: "lotacao", label: "Lotação" },
      { key: "situacao", label: "Situação" },
      { key: "status", label: "Status" },
      { key: "dataIncorp", label: "Data de incorporação" },
      { key: "dataPromocao", label: "Data da promoção" },
      { key: "equipeFerias", label: "Equipe de férias" },
    ],
  },
  {
    titulo: "Dados pessoais",
    campos: [
      { key: "cpf", label: "CPF" },
      { key: "rg", label: "RG" },
      { key: "dataNasc", label: "Data de nascimento" },
      { key: "sexo", label: "Sexo" },
      { key: "estadoCivil", label: "Estado civil" },
      { key: "naturalidade", label: "Naturalidade" },
      { key: "naturalidadeUF", label: "UF naturalidade" },
      { key: "nomePai", label: "Nome do pai" },
      { key: "nomeMae", label: "Nome da mãe" },
      { key: "tipoSanguineo", label: "Tipo sanguíneo" },
      { key: "fatorRH", label: "Fator RH" },
      { key: "grauEscolaridade", label: "Escolaridade" },
      { key: "cursosPMMA", label: "Cursos PMMA" },
    ],
  },
  {
    titulo: "Contato e endereço",
    campos: [
      { key: "telefone", label: "Telefone" },
      { key: "email", label: "E-mail" },
      { key: "endereco", label: "Endereço" },
      { key: "bairro", label: "Bairro" },
      { key: "cidade", label: "Cidade" },
      { key: "cep", label: "CEP" },
    ],
  },
  {
    titulo: "Dados bancários",
    campos: [
      { key: "banco", label: "Banco" },
      { key: "agencia", label: "Agência" },
      { key: "conta", label: "Conta" },
      { key: "tipoConta", label: "Tipo de conta" },
    ],
  },
  {
    titulo: "Emergência e dependentes",
    campos: [
      { key: "possuiDependentes", label: "Possui dependentes" },
      { key: "emergenciaNome", label: "Contato de emergência" },
      { key: "emergenciaTelefone", label: "Telefone de emergência" },
      { key: "emergenciaGrau", label: "Grau de parentesco" },
    ],
  },
  {
    titulo: "CNH",
    campos: [
      { key: "cnh", label: "CNH" },
      { key: "cnhCategoria", label: "Categoria" },
      { key: "cnhVencimento", label: "Vencimento" },
    ],
  },
  {
    titulo: "Registro",
    campos: [{ key: "observacoes", label: "Observações", tipo: "area" }],
  },
];

export default function NovoEfetivoForm() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function mudar(key: string, valor: string) {
    setForm((f) => ({ ...f, [key]: valor }));
  }

  async function salvar() {
    setErro("");
    if (!(form.id ?? "").trim()) {
      setErro("O ID PMMA é obrigatório.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/efetivo/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      setSalvando(false);
      if (!res.ok) {
        setErro(j.erro || "Não foi possível cadastrar.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/efetivo/${encodeURIComponent(j.id)}`);
      router.refresh();
    } catch {
      setSalvando(false);
      setErro("Erro de conexão ao cadastrar.");
    }
  }

  return (
    <div className="space-y-5">
      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {erro}
        </p>
      )}

      {SECOES.map((secao) => (
        <section key={secao.titulo} className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" />
            {secao.titulo}
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {secao.campos.map((c) => (
              <div key={c.key} className={c.tipo === "area" ? "sm:col-span-2 md:col-span-3" : ""}>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {c.label}
                </label>
                {c.tipo === "area" ? (
                  <textarea
                    value={form[c.key] ?? ""}
                    onChange={(e) => mudar(c.key, e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                  />
                ) : (
                  <input
                    type="text"
                    value={form[c.key] ?? ""}
                    onChange={(e) => mudar(c.key, e.target.value)}
                    className={`w-full rounded-lg border bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50 ${
                      c.key === "id" ? "border-[#D4AF37]/40" : "border-white/10"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? "Cadastrando..." : "Cadastrar militar"}
        </button>
        <button
          onClick={() => router.push("/efetivo")}
          className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
