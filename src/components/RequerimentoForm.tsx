"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, AlertTriangle } from "lucide-react";
import {
  usaQuadrinhoOutros, ehModeloAquisicao, ehModeloTransferencia, registroDeOrigem,
} from "@/lib/requerimentos";
import { obrigatoriosDoModelo, CAMPOS_ALIENANTE } from "@/lib/requerimentoArma";
import { BuscaMilitar, type Militar } from "@/components/docs/Comum";

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
  { key: "idPmmaTxt", label: "ID PMMA" },
  { key: "postoGrad", label: "Posto/Graduação" },
  { key: "numeroPm", label: "Nº do PM" },
  { key: "tempoServico", label: "Tempo de serviço" },
  { key: "cargoFuncao", label: "Cargo/Função" },
  { key: "estadoCivil", label: "Estado civil" },
  { key: "opmClassificado", label: "OPM classificado" },
  { key: "opmExercicio", label: "OPM em exercício" },
];

/* Aquisicao de arma (uso restrito e uso permitido): a folha de PCE pede so
   estes dados do adquirente — nao adianta mostrar tempo de servico, estado
   civil e OPM, que nao tem onde sair no papel. O endereco vai na linha
   "Endereço de entrega" (logradouro + complemento + bairro juntos).
   O Posto/Graduacao entra no "Cargo:" da folha de uso permitido. */
const CAMPOS_AQUISICAO: { key: string; label: string; col?: number }[] = [
  { key: "nomeCompleto", label: "Nome completo", col: 3 },
  { key: "postoGrad", label: "Cargo (posto/graduação)" },
  { key: "idPmmaTxt", label: "Identidade (ID PMMA)" },
  { key: "cpf", label: "CPF" },
  { key: "email", label: "E-mail pessoal" },
  { key: "endereco", label: "Endereço de entrega", col: 2 },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "municipio", label: "Cidade/UF" },
  { key: "fone", label: "Telefone pessoal" },
];

type Campo = { key: string; label: string; col?: number; dica?: string };

/* Transferencia de arma (SIGMA/SINARM para SIGMA): o quadro 1 da folha pede
   posto, nome, identidade, CPF, orgao de vinculacao e o endereco "com Tlf e
   email" numa linha so. O RG PMMA, o estado civil e o CEP nao saem na folha
   — sao do TERMO DE DOACAO, que o adquirente assina como recebedor. */
const CAMPOS_TRANSF_ADQUIRENTE: Campo[] = [
  { key: "nomeCompleto", label: "Nome completo", col: 3 },
  { key: "postoGrad", label: "Posto/Grad/Função" },
  { key: "idPmmaTxt", label: "Identidade (ID PMMA)" },
  { key: "rg", label: "RG PMMA (termo)" },
  { key: "cpf", label: "CPF" },
  { key: "orgao", label: "Órgão de vinculação" },
  { key: "estadoCivil", label: "Estado civil (termo)" },
  { key: "fone", label: "Telefone" },
  { key: "email", label: "E-mail", col: 2 },
  { key: "endereco", label: "Endereço (rua e nº)", col: 2 },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "municipio", label: "Cidade/UF" },
  { key: "cep", label: "CEP" },
];

// quadro "2. IDENTIFICACAO DO ALIENANTE" + o que o termo pede do DOADOR
const CAMPOS_TRANSF_ALIENANTE: Campo[] = [
  { key: "alienanteNome", label: "Nome completo", col: 2 },
  { key: "alienantePosto", label: "Posto/Grad/Função/CR" },
  { key: "alienanteIdentidade", label: "Identidade" },
  { key: "alienanteRg", label: "RG PMMA (termo)" },
  { key: "alienanteCpf", label: "CPF" },
  { key: "alienanteOrgao", label: "Órgão de vinculação" },
  { key: "alienanteAcervo", label: "Acervo atual da arma", dica: "Ex: CIDADÃO" },
  { key: "alienanteNacionalidade", label: "Nacionalidade (termo)" },
  { key: "alienanteEstadoCivil", label: "Estado civil (termo)" },
  { key: "alienanteNasc", label: "Data de nascimento (termo)", dica: "dd/mm/aaaa" },
  { key: "alienanteNaturalidade", label: "Naturalidade — cidade (termo)" },
  { key: "alienantePai", label: "Nome do pai (termo)", col: 3 },
  { key: "alienanteMae", label: "Nome da mãe (termo)", col: 3 },
];

// quadro "3. IDENTIFICACAO DA ARMA OBJETO DA AQUISICAO POR TRANSFERENCIA"
function camposArmaTransferencia(registro: string): Campo[] {
  return [
    { key: "registro", label: `Nº ${registro}`, dica: `Nº do registro no ${registro}` },
    { key: "produto", label: "Tipo", dica: "Ex: PISTOLA" },
    { key: "marca", label: "Marca", dica: "Ex: TAURUS" },
    { key: "modeloArma", label: "Modelo", dica: "Ex: G2C" },
    { key: "serie", label: "Número de série" },
    { key: "calibre", label: "Calibre", dica: "Ex: 9MM" },
    { key: "acabamento", label: "Acabamento (termo)", dica: "Ex: OXIDADO" },
    { key: "acessorios", label: "Acessórios e/ou sobressalentes (quando for o caso)", col: 2 },
    { key: "outras", label: "Outras especificações (quando for o caso)", col: 3 },
  ];
}

// quadro "2. PRODUTO CONTROLADO A SER ADQUIRIDO" das folhas de PCE
const CAMPOS_PCE: { key: string; label: string; dica: string }[] = [
  { key: "produto", label: "Produto", dica: "Ex: PISTOLA" },
  { key: "marca", label: "Marca", dica: "Ex: TAURUS" },
  { key: "modeloArma", label: "Modelo", dica: "Ex: G3C" },
  { key: "calibre", label: "Calibre", dica: "Ex: 9MM" },
  { key: "quantidade", label: "Quantidade", dica: "Ex: 01" },
];

export default function RequerimentoForm({
  modalidade,
  modelo,
  inicial,
  // quando vem preenchido, o formulario EDITA esse requerimento em vez de
  // criar um novo (mesma tela, mesmos campos — muda so o destino)
  editandoId,
}: {
  modalidade: string;
  modelo: string;
  inicial: Dados;
  editandoId?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<Dados>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const ehCursos = modelo === "cursos";
  // formularios de PCE (uso restrito/permitido e transferencias), nao a folha da PMMA
  const ehAquisicao = ehModeloAquisicao(modelo);
  // transferencia: tem alienante, arma ja registrada e termo de doacao
  const ehTransferencia = ehModeloTransferencia(modelo);
  // "OUTROS" puro ou modalidade que cai no quadrinho OUTROS (arma, colete...)
  const ehOutros = !ehAquisicao && usaQuadrinhoOutros(modalidade);
  const campos: Campo[] = ehTransferencia
    ? CAMPOS_TRANSF_ADQUIRENTE
    : ehAquisicao ? CAMPOS_AQUISICAO : CAMPOS_PESSOAIS;
  // marca com * o que a folha nao deixa sair em branco
  const obrigatorios = obrigatoriosDoModelo(modelo);

  // alienante escolhido no buscador do efetivo (opcional: pode ser de fora)
  const [alienanteSel, setAlienanteSel] = useState<Militar | null>(
    inicial.alienanteId
      ? { id: inicial.alienanteId, nome: inicial.alienanteNome, postoGrad: inicial.alienantePosto }
      : null
  );
  const [avisoAlienante, setAvisoAlienante] = useState("");

  function set(k: string, v: string) {
    setF((o) => ({ ...o, [k]: v }));
  }

  /* Alienante do Batalhao: puxa da ficha o que der. Quem nao e o P/1 recebe
     o colega sem estado civil, nascimento, naturalidade e filiacao (a API
     nao entrega) — esses ele pede ao alienante e digita. */
  async function puxarAlienante(m: Militar) {
    setAlienanteSel(m);
    setAvisoAlienante("");
    try {
      const res = await fetch(`/api/requerimentos/alienante?id=${encodeURIComponent(m.id)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAvisoAlienante(d.error || "Não foi possível ler a ficha do alienante."); return; }
      const dados = (d.dados || {}) as Record<string, string>;
      setF((o) => {
        const novo = { ...o };
        for (const [k, v] of Object.entries(dados)) if (v) novo[k] = v;
        return novo;
      });
      if (d.parcial) {
        setAvisoAlienante(
          "Estado civil, nascimento, naturalidade e filiação do alienante não vêm da ficha para você — " +
          "peça a ele e preencha (só o P/1 puxa esses dados de outro militar)."
        );
      }
    } catch {
      setAvisoAlienante("Erro de conexão ao ler a ficha do alienante.");
    }
  }

  // trocar o alienante: some o vinculo com a ficha e os dados dele
  function limparAlienante() {
    setAlienanteSel(null);
    setAvisoAlienante("");
    setF((o) => {
      const novo = { ...o };
      for (const k of CAMPOS_ALIENANTE) novo[k] = "";
      novo.alienanteOrgao = "PMMA";
      novo.alienanteNacionalidade = "brasileiro";
      return novo;
    });
  }

  // Campos obrigatorios so para ENVIAR (rascunho pode ficar incompleto).
  // Cursos: CPF, e-mail (ja existem na ficha) + os 4 dados da pagina 2 que
  // so o requerente/comandante sabem na hora (o item 6 do documento, a data
  // de inclusao, o sistema deriva sozinho da ficha — nao precisa pedir).
  function faltando(): string[] {
    // Aquisicao de arma: a folha so anda com o adquirente identificado e o
    // produto (ou a arma transferida e o alienante) descrito — sem isso o
    // pedido volta. A lista e a mesma que a API confere.
    if (ehAquisicao) {
      return Object.entries(obrigatorios)
        .filter(([k]) => !(f[k] ?? "").trim())
        .map(([, rotulo]) => rotulo);
    }
    if (!ehCursos) return [];
    const nomes: Record<string, string> = {
      cpf: "CPF", email: "E-mail",
      p2Conceito: "Conceito Militar",
      p2UltimaPromocao: "Data da última promoção",
      p2BgNumero: "Nº do BG da última promoção",
      p2BgData: "Data do BG",
    };
    return Object.entries(nomes)
      .filter(([k]) => !(f[k] ?? "").trim())
      .map(([, rotulo]) => rotulo);
  }

  async function enviar(acao: "rascunho" | "enviar") {
    setErro("");
    if (acao === "enviar") {
      const falta = faltando();
      if (falta.length) {
        setErro(`Preencha antes de enviar: ${falta.join(", ")}.`);
        return;
      }
    }
    setSalvando(true);
    try {
      const res = await fetch(
        editandoId ? `/api/requerimentos/${editandoId}` : "/api/requerimentos",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modalidade, modelo, acao, dados: f }),
        }
      );
      const d = await res.json().catch(() => ({}));
      setSalvando(false);
      if (!res.ok) { setErro(d.error || "Não foi possível salvar."); return; }
      router.push(`/requerimentos/${editandoId || d.id}`);
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

  function campo(c: Campo) {
    return (
      <div key={c.key} className={classeCol(c.col)}>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          {c.label}{obrigatorios[c.key] ? " *" : ""}
        </label>
        <input
          type="text"
          value={f[c.key] ?? ""}
          onChange={(e) => set(c.key, e.target.value)}
          placeholder={c.dica}
          className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* dados pessoais */}
      <section className="ui-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Dados do requerente
        </h2>
        <p className="mb-4 text-[12px] text-[#94A3B8]">
          {editandoId
            ? "Ajuste o que precisar. Se o documento já tinha sido gerado, ele é descartado — gere de novo depois de salvar, para sair com o texto novo."
            : "Os campos vêm da sua ficha. Confira e ajuste o que precisar — fica salvo para os próximos requerimentos."}
        </p>
        {ehTransferencia && (
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            O requerente é o <b>adquirente</b> (o recebedor no termo de doação). Os campos marcados com
            “termo” só saem no Termo de Doação.
          </p>
        )}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
          {campos.map(campo)}

          {ehCursos && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">CPF *</label>
                <input type="text" value={f.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">E-mail *</label>
                <input type="text" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              </div>
            </>
          )}
        </div>
      </section>

      {/* transferencia, quadro 2: quem passa a arma (o doador do termo) */}
      {ehTransferencia && (
        <section className="ui-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Alienante (quem passa a arma)
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            É o <b>doador</b> no termo de doação. Se for militar do Batalhão, busque pelo nome e os
            dados vêm da ficha; se for de fora, preencha à mão.
          </p>
          <div className="mb-4 rounded-lg border border-white/10 bg-[#0b1626] p-3">
            <BuscaMilitar
              sel={alienanteSel}
              onEscolher={puxarAlienante}
              onLimpar={limparAlienante}
              rotulo="Buscar alienante no efetivo (opcional)"
            />
          </div>
          {avisoAlienante && (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {avisoAlienante}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {CAMPOS_TRANSF_ALIENANTE.map(campo)}
          </div>
        </section>
      )}

      {/* transferencia, quadro 3: a arma, que ja tem registro e numero de serie */}
      {ehTransferencia && (
        <section className="ui-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Arma objeto da transferência
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            Copie do CRAF da arma. O novo acervo sai como “cidadão”, como já vem impresso na folha.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {camposArmaTransferencia(registroDeOrigem(modelo)).map(campo)}
          </div>
        </section>
      )}

      {/* quadro 2 do formulario do Exercito: o produto controlado */}
      {ehAquisicao && !ehTransferencia && (
        <section className="ui-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Produto controlado a ser adquirido
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            Sai na tabela do quadro 2 do formulário. A quantidade somada ao que você já possui não pode
            passar do limite das normas da COLOG.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {CAMPOS_PCE.map(campo)}
          </div>
        </section>
      )}

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

      {/* Amparo legal e informações adicionais: o formulário do Exército não
          tem esses quadros (o texto da solicitação já vem impresso nele). */}
      {!ehAquisicao && (
        <>
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
        </>
      )}

      {/* pagina 2 - so cursos (campos obrigatorios para enviar) */}
      {ehCursos && (
        <section className="ui-card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Informações do comandante (pág. 2 — verso)
          </h2>
          <p className="mb-4 text-[12px] text-[#94A3B8]">
            Os itens 1º a 3º e o 6º da situação jurídica já saem prontos no documento — o 6º é calculado
            sozinho a partir da data de inclusão. Preencha só o que só você sabe: o conceito e os dados da
            última promoção.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Conceito militar *</label>
              <input type="text" value={f.p2Conceito ?? ""} onChange={(e) => set("p2Conceito", e.target.value)}
                placeholder="Ex: EXCEPCIONAL"
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Data da última promoção *</label>
              <input type="date" value={f.p2UltimaPromocao ?? ""} onChange={(e) => set("p2UltimaPromocao", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div />
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Nº do BG da última promoção *</label>
              <input type="text" value={f.p2BgNumero ?? ""} onChange={(e) => set("p2BgNumero", e.target.value)}
                placeholder="Ex: 009"
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Data do BG *</label>
              <input type="date" value={f.p2BgData ?? ""} onChange={(e) => set("p2BgData", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Observação adicional do comandante (opcional)</label>
              <textarea rows={3} value={f.p2Complementares ?? ""} onChange={(e) => set("p2Complementares", e.target.value)}
                placeholder="Só se houver algo além do texto padrão da página 2..."
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
