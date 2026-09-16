"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Plus, Trash2, Info } from "lucide-react";
import { imprimirElemento } from "@/lib/imprimir";
import {
  Cabecalho, Campo, ESTILO_FOLHA, FOLHA_A4, nomeBusca, type Militar,
} from "@/components/docs/Comum";

/* =========================================================================
   REQUERIMENTO DE PREMIAÇÃO PECUNIÁRIA
   (por apreensão de arma de fogo em situação irregular)

   Diferente dos outros requerimentos do sistema em dois pontos que mudam tudo:

   1. É COLETIVO. Um documento só, assinado por vários policiais — os que
      participaram da mesma apreensão. Os requerimentos comuns são de UM
      militar, e por isso saem de um template .docx com os dados dele.
   2. NÃO TEM TEMPLATE. Aqui a folha é montada na tela, o que permite usar o
      MESMO cabeçalho da Escala de Serviço: trocar a logo do aniversário da
      PMMA na escala troca aqui também, sem mexer em arquivo nenhum.

   O texto do corpo é o do modelo oficial, com a Instrução Normativa e o
   Decreto que fundamentam o pedido — e continua editável, porque a norma pode
   mudar e o P/1 não pode ficar esperando alguém alterar o sistema.
   ========================================================================= */

const CONTATO = "(99) 98509-5005 (Permanência) – 18batalhaopmma@gmail.com";

const TEXTO_PADRAO =
  "O(s) signatário(s) abaixo qualificado(s), policial(is) (civil ou militar) do serviço ativo, " +
  "requer(em) o pagamento de premiação pecuniária por apreensão de arma(s) de fogo em situação " +
  "irregular, de acordo com a Instrução Normativa nº 01, de 29 de março de 2016, que disciplina o " +
  "Decreto nº 31.564, de 28 de março de 2016, e conforme documentação anexa, que acompanha o " +
  "presente pedido:";

const DESTINATARIO = "EXCELENTÍSSIMO SENHOR SECRETÁRIO DE ESTADO DA SEGURANÇA PÚBLICA";

type Linha = {
  chave: string;          // identidade da linha na tela (id do efetivo, ou avulso)
  efetivoId: string;      // vazio = digitado à mão
  cargo: string;
  nome: string;
  matricula: string;
  idPmma: string;
  lotacao: string;
  banco: string;
};

/* A API do efetivo traz a lotação; o tipo compartilhado não a declara. */
type MilitarComLotacao = Militar & { lotacao?: string | null };

const vazia = (): Linha => ({
  chave: `m-${Math.random().toString(36).slice(2)}`,
  efetivoId: "", cargo: "", nome: "", matricula: "", idPmma: "", lotacao: "18º BPM", banco: "",
});

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function RequerimentoPecuniaDoc() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [texto, setTexto] = useState(TEXTO_PADRAO);
  const [destinatario, setDestinatario] = useState(DESTINATARIO);
  const [local, setLocal] = useState("Presidente Dutra/MA");
  const [data, setData] = useState(hojeBR());

  const [efetivo, setEfetivo] = useState<MilitarComLotacao[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as MilitarComLotacao[])).catch(() => {});
  }, []);

  const jaTem = useMemo(() => new Set(linhas.map((l) => l.efetivoId).filter(Boolean)), [linhas]);
  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return efetivo
      .filter((m) => !jaTem.has(m.id))
      .filter((m) => (nomeBusca(m) + " " + (m.nome || "") + " " + (m.matricula || "")).toLowerCase().includes(t))
      .slice(0, 8);
  }, [busca, efetivo, jaTem]);

  /* Escolher no buscador preenche CARGO, NOME, MATRÍCULA, ID e LOTAÇÃO de uma
     vez — cinco das seis colunas. Só os dados bancários sobram para digitar,
     porque o sistema não os guarda (e nem deveria). */
  const acrescentar = (m: MilitarComLotacao) => {
    setLinhas((l) => [...l, {
      chave: m.id,
      efetivoId: m.id,
      cargo: (m.postoGrad || "").toUpperCase(),
      nome: m.nome || m.nomeGuerra || "",
      matricula: m.matricula || "",
      idPmma: m.numeroBarra || "",
      lotacao: m.lotacao || "18º BPM",
      banco: "",
    }]);
    setBusca("");
  };

  const mudar = (chave: string, patch: Partial<Linha>) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, ...patch } : x)));
  const remover = (chave: string) => setLinhas((l) => l.filter((x) => x.chave !== chave));

  /* As assinaturas saem DE DOIS EM DOIS, como no modelo em papel. */
  const pares = useMemo(() => {
    const out: Linha[][] = [];
    for (let i = 0; i < linhas.length; i += 2) out.push(linhas.slice(i, i + 2));
    return out;
  }, [linhas]);

  const td: React.CSSProperties = { border: "0.5pt solid #000", padding: "2pt 3pt", fontSize: "9pt", verticalAlign: "middle" };
  const th: React.CSSProperties = { ...td, fontWeight: "bold", textAlign: "center", fontSize: "8.5pt" };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILO_FOLHA }} />

      {/* ---------------- controles (não vão para o papel) ---------------- */}
      <div className="nao-imprimir mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => imprimirElemento(document.getElementById("pecunia-print"), { titulo: "Requerimento de premiação pecuniária" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] transition hover:brightness-110"
          >
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8]">
            <Info className="h-3.5 w-3.5" /> Clique em qualquer texto do documento para editar antes de imprimir.
          </span>
        </div>

        <label className="mb-1 block text-xs text-[#94A3B8]">
          Acrescentar policial (preenche cargo, nome, matrícula, ID e lotação)
        </label>
        <div className="relative">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou matrícula..."
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50"
          />
          {achados.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0F1B2D] shadow-2xl">
              {achados.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => acrescentar(m)}
                  className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/5"
                >
                  {nomeBusca(m)}
                  {m.matricula ? <span className="text-xs text-[#94A3B8]"> · mat {m.matricula}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setLinhas((l) => [...l, vazia()])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#cbd5e1] transition hover:border-[#D4AF37]/40 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> linha em branco (policial civil, ou de fora do efetivo)
        </button>
        {linhas.length > 0 && (
          <p className="mt-2 text-xs text-[#94A3B8]">
            {linhas.length} policial(is) no requerimento. Os dados bancários são digitados na tabela.
          </p>
        )}
      </div>

      {/* ---------------- a folha ---------------- */}
      <div className="overflow-x-auto">
        <div id="pecunia-print" className="folha-diaria mx-auto bg-white text-black shadow-xl" style={FOLHA_A4}>
          <Cabecalho
            contato={CONTATO}
            orgDestaque
            tamanhos={{ pmma: ["26mm", "22mm"], ma: ["30mm", "16mm"], bpm: ["22mm", "22mm"] }}
          />

          <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 6mm", textDecoration: "underline" }}>
            REQUERIMENTO PREMIAÇÃO PECUNIÁRIA
          </h1>

          <p style={{ fontWeight: "bold", fontSize: "11pt", margin: "0 0 6mm" }}>
            <Campo valor={destinatario} onChange={setDestinatario} inline negrito />
          </p>

          <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
            <Campo valor={texto} onChange={setTexto} inline />
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 6mm" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: "8mm" }}>ORD</th>
                <th style={{ ...th, width: "22mm" }}>CARGO</th>
                <th style={th}>NOME COMPLETO</th>
                <th style={{ ...th, width: "20mm" }}>MATRÍCULA</th>
                <th style={{ ...th, width: "20mm" }}>ID</th>
                <th style={{ ...th, width: "20mm" }}>LOTAÇÃO</th>
                <th style={{ ...th, width: "34mm" }}>DADOS BANCÁRIOS</th>
                <th style={{ ...th, width: "6mm", border: "none" }} className="nao-imprimir" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.chave}>
                  <td style={{ ...td, textAlign: "center" }}>{String(i + 1).padStart(2, "0")}</td>
                  <td style={td}><Campo valor={l.cargo} onChange={(v) => mudar(l.chave, { cargo: v })} inline /></td>
                  <td style={td}><Campo valor={l.nome} onChange={(v) => mudar(l.chave, { nome: v })} inline /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.matricula} onChange={(v) => mudar(l.chave, { matricula: v })} inline /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.idPmma} onChange={(v) => mudar(l.chave, { idPmma: v })} inline /></td>
                  <td style={{ ...td, textAlign: "center" }}><Campo valor={l.lotacao} onChange={(v) => mudar(l.chave, { lotacao: v })} inline /></td>
                  <td style={td}><Campo valor={l.banco} onChange={(v) => mudar(l.chave, { banco: v })} inline /></td>
                  <td style={{ border: "none", padding: "0 0 0 3pt" }} className="nao-imprimir">
                    <button onClick={() => remover(l.chave)} title="tirar do requerimento" style={{ color: "#b3261e", background: "none", border: "none", cursor: "pointer" }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: "center", color: "#777", fontStyle: "italic", padding: "6pt" }}>
                    Use o buscador acima para acrescentar os policiais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p style={{ textAlign: "right", margin: "8mm 0 12mm" }}>
            <Campo valor={local} onChange={setLocal} inline />, <Campo valor={data} onChange={setData} inline />.
          </p>

          {/* Assinaturas de dois em dois, como no modelo em papel. O nome vai
              ACIMA da linha porque é assim que o documento oficial faz — quem
              confere lê o nome e a assinatura no mesmo bloco. */}
          {pares.map((par, i) => (
            <div key={i} style={{ display: "flex", gap: "8mm", marginBottom: "10mm", breakInside: "avoid" }}>
              {par.map((l) => (
                <div key={l.chave} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: "10.5pt", marginBottom: "1mm", minHeight: "5mm" }}>{l.nome}</div>
                  <div style={{ borderTop: "0.8pt solid #000", paddingTop: "1mm", fontSize: "8.5pt" }}>
                    {[l.cargo, l.matricula ? `Mat. ${l.matricula}` : ""].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
              {/* Sobrou um sozinho na última fileira: a coluna vazia mantém a
                  linha dele com a mesma largura das de cima. */}
              {par.length === 1 && <div style={{ flex: 1 }} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
