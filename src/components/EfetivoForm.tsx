"use client";

import { useState, useEffect, useRef } from "react";
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

  // campos que sao data: exibir como dd/mm/aaaa
  const CAMPOS_DATA = new Set([
    "dataIncorp", "dataPromocao", "dataNasc", "cnhVencimento",
    "jmsDataInicio", "jmsDataRetorno",
  ]);

  function fmtData(valor: string): string {
    if (!valor || !valor.trim()) return "";
    const s = valor.trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}`;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${d.getFullYear()}`;
    }
    return s;
  }

  const inicial: Record<string, string> = {};
  SECOES.forEach((s) =>
    s.campos.forEach((c) => {
      const bruto = militar[c.key] ?? "";
      inicial[c.key] = CAMPOS_DATA.has(c.key) ? fmtData(bruto) : bruto;
    })
  );

  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // ---- autocomplete da lotacao ----
  const [lotacoes, setLotacoes] = useState<string[]>([]);
  const [lotFocado, setLotFocado] = useState(false);
  const lotBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // so o admin edita lotacao; busca a lista de lotacoes existentes
    if (!isAdmin) return;
    let vivo = true;
    fetch("/api/lotacoes")
      .then((r) => r.json())
      .then((d) => { if (vivo) setLotacoes(Array.isArray(d.lotacoes) ? d.lotacoes : []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [isAdmin]);

  // fecha a lista de sugestoes ao clicar fora
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (lotBoxRef.current && !lotBoxRef.current.contains(e.target as Node)) {
        setLotFocado(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function podeEditar(grupo: Grupo): boolean {
    return isAdmin || grupo === "pessoal";
  }

  function mudar(key: string, valor: string) {
    setForm((f) => ({ ...f, [key]: valor }));
  }

  // sugestoes filtradas pelo que ja foi digitado na lotacao
  const termoLot = (form["lotacao"] ?? "").trim().toLowerCase();
  const sugestoesLot = termoLot
    ? lotacoes.filter((l) => l.toLowerCase().includes(termoLot) && l.toLowerCase() !== termoLot).slice(0, 8)
    : lotacoes.slice(0, 8);

  async function salvar() {
    setErro("");
    setSalvando(true);

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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Você está editando a sua própria ficha. Os campos funcionais (posto,
          lotação, situação, etc.) só podem ser alterados pelo administrador.
        </div>
      )}

      {SECOES.map((secao) => {
        const editavel = podeEditar(secao.grupo);
        return (
          <section key={secao.titulo} className="ui-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded bg-[#D4AF37]" />
              {secao.titulo}
              {!editavel && (
                <span className="ml-1 inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-[#94A3B8]">
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
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                    {c.label}
                  </label>
                  {c.tipo === "area" ? (
                    <textarea
                      value={form[c.key]}
                      onChange={(e) => mudar(c.key, e.target.value)}
                      disabled={!editavel}
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50 disabled:opacity-50"
                    />
                  ) : c.key === "lotacao" && editavel ? (
                    // campo lotacao com autocomplete (sugestoes das lotacoes existentes)
                    <div className="relative" ref={lotBoxRef}>
                      <input
                        type="text"
                        value={form[c.key]}
                        onChange={(e) => { mudar(c.key, e.target.value); setLotFocado(true); }}
                        onFocus={() => setLotFocado(true)}
                        autoComplete="off"
                        placeholder="Digite e escolha a lotação..."
                        className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                      />
                      {lotFocado && sugestoesLot.length > 0 && (
                        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-white/10 bg-[#0b1626] py-1 shadow-xl">
                          {sugestoesLot.map((s) => (
                            <li key={s}>
                              <button
                                type="button"
                                onClick={() => { mudar("lotacao", s); setLotFocado(false); }}
                                className="block w-full px-3 py-2 text-left text-sm text-[#E8EEF6] transition hover:bg-[#D4AF37]/15 hover:text-white"
                              >
                                {s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={form[c.key]}
                      onChange={(e) => mudar(c.key, e.target.value)}
                      disabled={!editavel}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50 disabled:opacity-50"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {erro}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
        <button
          onClick={() => router.push(`/efetivo/${encodeURIComponent(militar.id ?? "")}`)}
          className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
