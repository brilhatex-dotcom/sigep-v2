"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Lock } from "lucide-react";

type Militar = Record<string, string | null>;
type Grupo = "pessoal" | "funcional";
type Campo = { key: string; label: string; tipo?: "texto" | "area" };
type Secao = { titulo: string; grupo: Grupo; campos: Campo[] };

const SECOES: Secao[] = [
  {
    titulo: "Identificação e dados funcionais",
    grupo: "funcional",
    campos: [
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
    grupo: "pessoal",
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
    grupo: "pessoal",
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
    grupo: "pessoal",
    campos: [
      { key: "banco", label: "Banco" },
      { key: "agencia", label: "Agência" },
      { key: "conta", label: "Conta" },
      { key: "tipoConta", label: "Tipo de conta" },
    ],
  },
  {
    titulo: "Emergência e dependentes",
    grupo: "pessoal",
    campos: [
      { key: "possuiDependentes", label: "Possui dependentes" },
      { key: "emergenciaNome", label: "Contato de emergência" },
      { key: "emergenciaTelefone", label: "Telefone de emergência" },
      { key: "emergenciaGrau", label: "Grau de parentesco" },
    ],
  },
  {
    titulo: "CNH",
    grupo: "pessoal",
    campos: [
      { key: "cnh", label: "CNH" },
      { key: "cnhCategoria", label: "Categoria" },
      { key: "cnhVencimento", label: "Vencimento" },
    ],
  },
  {
    titulo: "JMS",
    grupo: "funcional",
    campos: [
      { key: "jmsDataInicio", label: "Início JMS" },
      { key: "jmsDataRetorno", label: "Retorno JMS" },
      { key: "jmsMotivo", label: "Motivo" },
    ],
  },
  {
    titulo: "Registro",
    grupo: "funcional",
    campos: [
      { key: "observacoes", label: "Observações", tipo: "area" },
      { key: "fotoURL", label: "Foto (URL)" },
    ],
  },
];

export default function EfetivoForm({
  militar,
  isAdmin,
}: {
  militar: Militar;
  isAdmin: boolean;
}) {
  const router = useRouter();

  const inicial: Record<string, string> = {};
  SECOES.forEach((s) =>
    s.campos.forEach((c) => {
      inicial[c.key] = militar[c.key] ?? "";
    })
  );

  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function podeEditar(grupo: Grupo): boolean {
    return isAdmin || grupo === "pessoal";
  }

  function mudar(key: string, valor: string) {
    setForm((f) => ({ ...f, [key]: valor }));
  }

  async function salvar() {
    setErro("");
    setSalvando(true);

    // Envia apenas os campos que este usuario pode editar.
    const payload: Record<string, string> = {};
    SECOES.forEach((s) => {
      if (podeEditar(s.grupo)) {
        s.campos.forEach((c) => {
          payload[c.key] = form[c.key];
        });
      }
    });

    try {
      const res = await fetch(`/api/efetivo/${encodeURIComponent(militar.id ?? "")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSalvando(false);

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j.erro || "Não foi possível salvar.");
        return;
      }
      router.push(`/efetivo/${encodeURIComponent(militar.id ?? "")}`);
      router.refresh();
    } catch {
      setSalvando(false);
      setErro("Erro de conexão ao salvar.");
    }
  }

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Você está editando a sua própria ficha. Os campos funcionais (posto,
          lotação, situação, etc.) só podem ser alterados pelo administrador.
        </div>
      )}

      {SECOES.map((secao) => {
        const editavel = podeEditar(secao.grupo);
        return (
          <section
            key={secao.titulo}
            className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
          >
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sigep-navy">
              <span className="h-4 w-1 rounded bg-sigep-dourado" />
              {secao.titulo}
              {!editavel && (
                <span className="ml-1 inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-gray-500">
                  <Lock className="h-3 w-3" /> somente admin
                </span>
              )}
            </h2>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
              {secao.campos.map((c) => (
                <div
                  key={c.key}
                  className={c.tipo === "area" ? "sm:col-span-2 md:col-span-3" : ""}
                >
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {c.label}
                  </label>
                  {c.tipo === "area" ? (
                    <textarea
                      value={form[c.key]}
                      onChange={(e) => mudar(c.key, e.target.value)}
                      disabled={!editavel}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sigep-dourado disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  ) : (
                    <input
                      type="text"
                      value={form[c.key]}
                      onChange={(e) => mudar(c.key, e.target.value)}
                      disabled={!editavel}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sigep-dourado disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-sigep-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sigep-azul disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
        <button
          onClick={() => router.push(`/efetivo/${encodeURIComponent(militar.id ?? "")}`)}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
