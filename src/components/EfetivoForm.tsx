"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, Lock } from "lucide-react";
import { SITUACOES_PADRAO, type SituacaoItem } from "@/lib/situacoesPadrao";

type Militar = Record<string, string | null>;
type Grupo = "pessoal" | "funcional";
type Campo = { key: string; label: string; tipo?: "texto" | "area" };
type Secao = { titulo: string; grupo: Grupo; campos: Campo[] };

// Hierarquia oficial (do mais alto para o mais baixo) usada no dropdown de posto.
const POSTOS = [
  "Coronel",
  "Tenente-Coronel",
  "Major",
  "Capitão",
  "1º Tenente",
  "2º Tenente",
  "Aspirante a Oficial",
  "Subtenente",
  "1º Sargento",
  "2º Sargento",
  "3º Sargento",
  "Cabo",
  "Soldado",
];

// Opcoes fixas do dropdown de Situacao. ATENCAO: alguns desses textos sao
// reconhecidos por trechos do sistema (dashboard, badges de cor, filtros) via
// correspondencia de substring (ex.: "licen", "jms", "pronto", "reserva",
// "ltip"). Nao renomear sem checar lib/situacao.ts e os componentes que usam
// corSituacao/porSituacao.
const SECOES: Secao[] = [
  {
    titulo: "Identificação e dados funcionais",
    grupo: "funcional",
    campos: [
      { key: "id", label: "ID PMMA (não editável)" },
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

/* Modal para adicionar/editar as situacoes do efetivo (nome + afastamento).
   Salva no servidor (/api/situacoes), valendo em todos os PCs. */
function ModalSituacoes({ inicial, onFechar, onSalvo }: {
  inicial: SituacaoItem[];
  onFechar: () => void;
  onSalvo: (lista: SituacaoItem[]) => void;
}) {
  const [lista, setLista] = useState<SituacaoItem[]>(inicial.map((s) => ({ ...s })));
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const add = () => {
    const nome = novo.trim();
    if (!nome) return;
    if (lista.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) { setErro("Já existe uma situação com esse nome."); return; }
    setLista((l) => [...l, { nome, afastamento: true }]);
    setNovo(""); setErro("");
  };
  const editarNome = (i: number, nome: string) => setLista((l) => l.map((s, j) => (j === i ? { ...s, nome } : s)));
  const toggleAf = (i: number) => setLista((l) => l.map((s, j) => (j === i ? { ...s, afastamento: !s.afastamento } : s)));
  const remover = (i: number) => setLista((l) => l.filter((_, j) => j !== i));

  const salvar = async () => {
    const limpa = lista.map((s) => ({ nome: s.nome.trim(), afastamento: s.afastamento })).filter((s) => s.nome);
    if (limpa.length === 0) { setErro("Informe ao menos uma situação."); return; }
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/situacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ situacoes: limpa }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Falha ao salvar");
      onSalvo(Array.isArray(d?.situacoes) ? d.situacoes : limpa);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível salvar."); setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" onClick={onFechar}>
      <div className="ui-card mt-10 w-full max-w-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Situações do efetivo</h2>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/5 hover:text-white">✕</button>
        </div>
        <p className="mb-4 text-xs text-[#94A3B8]">
          Marque <b>&ldquo;afastamento&rdquo;</b> quando a situação tira o militar do serviço (sai da escala/organograma e aparece destacado). Ex.: Prisão Provisória.
        </p>

        <div className="mb-4 space-y-2">
          {lista.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={s.nome}
                onChange={(e) => editarNome(i, e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-[#cdd9ea]">
                <input type="checkbox" checked={s.afastamento} onChange={() => toggleAf(i)} /> afastamento
              </label>
              <button type="button" onClick={() => remover(i)} title="Remover" className="shrink-0 rounded-lg border border-white/10 px-2 py-2 text-xs text-[#94A3B8] hover:border-red-500/40 hover:text-red-300">🗑</button>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Nova situação (ex.: Prisão Provisória)"
            className="flex-1 rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
          />
          <button type="button" onClick={add} className="shrink-0 rounded-lg border border-[#D4AF37]/40 px-3 py-2 text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10">+ Adicionar</button>
        </div>

        {erro && <p className="mb-3 text-sm text-red-300">{erro}</p>}

        <div className="flex items-center gap-3">
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60">
            {salvando ? "Salvando..." : "Salvar situações"}
          </button>
          <button type="button" onClick={onFechar} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

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
  // id nao esta nas SECOES (e somente leitura, tratado a parte)
  inicial["id"] = militar["id"] ?? "";

  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // ---- autocomplete da lotacao ----
  const [lotacoes, setLotacoes] = useState<string[]>([]);
  const [lotFocado, setLotFocado] = useState(false);
  const [situacoesLista, setSituacoesLista] = useState<SituacaoItem[]>(SITUACOES_PADRAO);
  const [gerenciandoSit, setGerenciandoSit] = useState(false);

  // carrega as situacoes configuradas (nome + afastamento) do servidor
  useEffect(() => {
    let vivo = true;
    fetch("/api/situacoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && Array.isArray(d?.situacoes) && d.situacoes.length) setSituacoesLista(d.situacoes); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
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

    // ID nunca e enviado no payload de update (e a chave primaria, imutavel).
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
      {/* Acao rapida no topo: salvar sem rolar ate o fim da pagina */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-end gap-3 rounded-b-lg bg-[#0a1220]/90 px-1 py-2 backdrop-blur">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>

      {gerenciandoSit && (
        <ModalSituacoes
          inicial={situacoesLista}
          onFechar={() => setGerenciandoSit(false)}
          onSalvo={(nova) => { setSituacoesLista(nova); setGerenciandoSit(false); }}
        />
      )}

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

            {/* ID PMMA: visivel no topo da primeira secao, sempre somente-leitura */}
            {secao.titulo === "Identificação e dados funcionais" && (
              <div className="mb-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                    <Lock className="h-3 w-3" /> ID PMMA (não editável)
                  </label>
                  <input
                    type="text"
                    value={form.id}
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white/60 outline-none"
                  />
                </div>
              </div>
            )}

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
                  ) : c.key === "postoGrad" && editavel ? (
                    // posto: dropdown com a hierarquia oficial
                    <select
                      value={form[c.key]}
                      onChange={(e) => mudar(c.key, e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                    >
                      <option value="">Selecione...</option>
                      {POSTOS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      {/* se o valor atual nao estiver na lista (caso raro), preserva-o */}
                      {form[c.key] && !POSTOS.includes(form[c.key]) && (
                        <option value={form[c.key]}>{form[c.key]}</option>
                      )}
                    </select>
                  ) : c.key === "situacao" && editavel ? (
                    // situacao: dropdown dinamico (configuravel) + gerenciar
                    <div className="flex items-center gap-2">
                      <select
                        value={form[c.key]}
                        onChange={(e) => mudar(c.key, e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                      >
                        <option value="">Selecione...</option>
                        {situacoesLista.map((s) => (
                          <option key={s.nome} value={s.nome}>{s.nome}</option>
                        ))}
                        {form[c.key] && !situacoesLista.some((s) => s.nome === form[c.key]) && (
                          <option value={form[c.key]}>{form[c.key]}</option>
                        )}
                      </select>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setGerenciandoSit(true)}
                          title="Adicionar / editar situações"
                          className="shrink-0 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-2 text-xs text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white"
                        >
                          ⚙ Situações
                        </button>
                      )}
                    </div>
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