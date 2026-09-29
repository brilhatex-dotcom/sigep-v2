"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { BuscaMilitar, type Militar } from "@/components/docs/Comum";
import { CAMPOS_ALIENANTE, padraoTransferencia } from "@/lib/requerimentoArma";

/* Peças da TRANSFERÊNCIA DE ARMA (SIGMA/SINARM para SIGMA) usadas pelas duas
   telas que criam requerimento: a individual e o lote do P/1. Ficam num lugar
   só para os rótulos e o "puxar o alienante da ficha" não divergirem. */

export type Campo = { key: string; label: string; col?: number; dica?: string };
type Valores = Record<string, string>;

// quadro "2. IDENTIFICACAO DO ALIENANTE" + o que o termo pede do DOADOR
export const CAMPOS_TRANSF_ALIENANTE: Campo[] = [
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
export function camposArmaTransferencia(registro: string): Campo[] {
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

function classeCol(col?: number): string {
  if (col === 3) return "sm:col-span-2 md:col-span-3";
  if (col === 2) return "sm:col-span-2";
  return "";
}

/* Grade de campos de texto; os obrigatórios para ENVIAR saem com "*".
   `children` entra no fim da mesma grade (campos que não são texto simples). */
export function GradeCampos({
  campos, valores, set, obrigatorios = {}, children,
}: {
  campos: Campo[];
  valores: Valores;
  set: (k: string, v: string) => void;
  obrigatorios?: Record<string, string>;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
      {campos.map((c) => (
        <div key={c.key} className={classeCol(c.col)}>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            {c.label}{obrigatorios[c.key] ? " *" : ""}
          </label>
          <input
            type="text"
            value={valores[c.key] ?? ""}
            onChange={(e) => set(c.key, e.target.value)}
            placeholder={c.dica}
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      ))}
      {children}
    </div>
  );
}

/* Buscador do alienante no efetivo. Escolhido, puxa da ficha o que der; quem
   não é o P/1 recebe o colega sem estado civil, nascimento, naturalidade e
   filiação (a API não entrega) — esses ele pede ao alienante e digita.
   O "selecionado" vem dos próprios valores (alienanteId), então preencher o
   alienante de fora — como o "igual para todos" do lote — já aparece aqui. */
export function BuscaAlienante({
  valores, setVarios,
}: {
  valores: Valores;
  setVarios: (o: Valores) => void;
}) {
  const [aviso, setAviso] = useState("");
  const sel: Militar | null = valores.alienanteId
    ? { id: valores.alienanteId, nome: valores.alienanteNome, postoGrad: valores.alienantePosto }
    : null;

  async function puxar(m: Militar) {
    setAviso("");
    setVarios({ alienanteId: m.id, alienanteNome: m.nome || "", alienantePosto: m.postoGrad || "" });
    try {
      const res = await fetch(`/api/requerimentos/alienante?id=${encodeURIComponent(m.id)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAviso(d.error || "Não foi possível ler a ficha do alienante."); return; }
      const dados = (d.dados || {}) as Valores;
      setVarios(Object.fromEntries(Object.entries(dados).filter(([, v]) => v)));
      if (d.parcial) {
        setAviso(
          "Estado civil, nascimento, naturalidade e filiação do alienante não vêm da ficha para você — " +
          "peça a ele e preencha (só o P/1 puxa esses dados de outro militar)."
        );
      }
    } catch {
      setAviso("Erro de conexão ao ler a ficha do alienante.");
    }
  }

  // trocar o alienante: some o vínculo com a ficha e os dados dele
  function limpar() {
    setAviso("");
    const padrao = padraoTransferencia();
    setVarios(Object.fromEntries(CAMPOS_ALIENANTE.map((k) => [k, padrao[k] ?? ""])));
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-white/10 bg-[#0b1626] p-3">
        <BuscaMilitar
          sel={sel}
          onEscolher={puxar}
          onLimpar={limpar}
          rotulo="Buscar alienante no efetivo (opcional)"
        />
      </div>
      {aviso && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}
    </>
  );
}
