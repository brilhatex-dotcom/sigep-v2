"use client";

import { useRef, useEffect, useState } from "react";
import { X, Printer, Pencil, Check, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export type DadosMemorando = {
  numero: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  quadro: string;       // QOE / QOEM (oficiais) — vazio para praças
  ehOficial: boolean;
  inicioBR: string;
  apresentacaoBR: string;
  diasFerias: number;
};

function hojeExtenso() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function dataExtenso(br: string): string {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return br;
  return `${parseInt(m[1])} de ${meses[parseInt(m[2]) - 1]} de ${m[3]}`;
}

// Abrevia o posto/graduação no padrão dos memorandos (ex.: "Capitão" -> "Cap.")
function abreviaPosto(posto: string): string {
  const p = (posto || "").trim().toLowerCase();
  const mapa: Record<string, string> = {
    "coronel": "Cel.",
    "tenente-coronel": "Ten. Cel.",
    "tenente coronel": "Ten. Cel.",
    "major": "Maj.",
    "capitão": "Cap.",
    "capitao": "Cap.",
    "1º tenente": "1º Ten.",
    "1° tenente": "1º Ten.",
    "primeiro tenente": "1º Ten.",
    "2º tenente": "2º Ten.",
    "2° tenente": "2º Ten.",
    "segundo tenente": "2º Ten.",
    "aspirante a oficial": "Asp. Of.",
    "aspirante": "Asp. Of.",
    "subtenente": "ST",
    "1º sargento": "1º Sgt.",
    "2º sargento": "2º Sgt.",
    "3º sargento": "3º Sgt.",
    "cabo": "CB",
    "soldado": "SD",
  };
  return mapa[p] ?? posto;
}

// Monta a linha "posto + (quadro) + identificação + nome" conforme oficial/praça.
// Praça:   "SD PM nº 333/18 - NOME COMPLETO"
// Oficial: "Cap. QOEM RURIK RAMOS TRINTA"  (sem número)
function linhaIdentificacao(d: DadosMemorando): string {
  const nome = (d.nome || "").toUpperCase();
  if (d.ehOficial) {
    const posto = abreviaPosto(d.postoGrad);
    const quadro = (d.quadro || "").trim();
    const meio = quadro ? `${posto} ${quadro}` : posto;
    return `${meio} ${nome}`;
  }
  // praça
  const posto = abreviaPosto(d.postoGrad);
  const barra = (d.numeroBarra || "").trim();
  return `${posto} PM nº ${barra} - ${nome}`;
}

// Campo editável com contentEditable — suporta bold/italic/underline via execCommand.
// onCommit devolve o HTML editado para o pai persistir (corrige o bug de a edicao
// se perder ao sair do modo de edicao).
function Campo({
  html, editando, style, multiline, onCommit,
}: {
  html: string; editando: boolean; style?: React.CSSProperties; multiline?: boolean;
  onCommit?: (novoHtml: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editandoAnterior = useRef(editando);

  useEffect(() => {
    const saiuDaEdicao = editandoAnterior.current && !editando;
    // ao SAIR da edicao: captura o que o usuario digitou e devolve ao pai
    if (saiuDaEdicao && ref.current && onCommit) {
      onCommit(ref.current.innerHTML);
    }
    // ao ENTRAR na edicao (ou montar): garante que o conteudo atual esteja no DOM
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
    editandoAnterior.current = editando;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  return (
    <div
      ref={ref}
      contentEditable={editando}
      suppressContentEditableWarning
      style={{
        display: "inline",
        outline: editando ? "1px solid #f59e0b" : "none",
        background: editando ? "#fefce8" : "transparent",
        borderRadius: 2,
        padding: editando ? "0 2px" : 0,
        minWidth: "2ch",
        whiteSpace: multiline ? "pre-wrap" : "normal",
        ...style,
      }}
      dangerouslySetInnerHTML={editando ? undefined : { __html: html }}
    />
  );
}

export default function MemorandoFerias({ dados, ano, onFechar }: {
  dados: DadosMemorando; ano: string; onFechar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [fontSize, setFontSize] = useState(12);

  const pt = `${fontSize}pt`;

  // identificação completa (posto + quadro/numero + nome), conforme oficial ou praça — SEM negrito
  const identificacao = linhaIdentificacao(dados);

  // HTMLs iniciais de cada campo (suportam tags html para negrito/itálico na edição manual)
  const campos = {
    numero:        useRef(`${dados.numero}`),
    cidadeData:    useRef(`Presidente Dutra-MA, ${hojeExtenso()}.`),
    de:            useRef(`1º Ten QOEM Chefe da 1ª Seção do 18º BPM.`),
    ao:            useRef(`${identificacao}.`),
    assunto:       useRef(`Concessão de Férias (${dados.diasFerias} dias).`),
    inicioExtenso: useRef(`<strong><u>${dataExtenso(dados.inicioBR)}</u></strong>`),
    apresExtenso:  useRef(`<strong><u>${dataExtenso(dados.apresentacaoBR)}</u></strong>`),
    dias:          useRef(`${dados.diasFerias}`),
    exercicio:     useRef(`${Number(ano) - 1}`),
    assinaturaAo:  useRef(`${identificacao}`),
    nomeCmt:       useRef(`1º TEN. QOEM. JOELSON DOS REIS SILVA`),
    cargoCmt:      useRef(`CHEFE DO P/1 DO 18º BPM`),
  };

  function fmt(cmd: string) {
    document.execCommand(cmd, false, undefined);
  }

  const C = ({ campo, style, multiline }: {
    campo: keyof typeof campos; style?: React.CSSProperties; multiline?: boolean;
  }) => (
    <Campo
      html={campos[campo].current}
      editando={editando}
      style={style}
      multiline={multiline}
      onCommit={(novo) => { campos[campo].current = novo; }}
    />
  );

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">

      {/* BARRA DE FERRAMENTAS */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 bg-[#0b1626] px-3 py-2 shadow print:hidden">

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
          <button onMouseDown={(e) => { e.preventDefault(); fmt("bold"); }} title="Negrito (Ctrl+B)"
            className="rounded p-1.5 text-white hover:bg-white/20"><Bold className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); fmt("italic"); }} title="Itálico (Ctrl+I)"
            className="rounded p-1.5 text-white hover:bg-white/20"><Italic className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); fmt("underline"); }} title="Sublinhado (Ctrl+U)"
            className="rounded p-1.5 text-white hover:bg-white/20"><Underline className="h-4 w-4" /></button>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <button onMouseDown={(e) => { e.preventDefault(); fmt("justifyLeft"); }} title="Esquerda"
            className="rounded p-1.5 text-white hover:bg-white/20"><AlignLeft className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); fmt("justifyCenter"); }} title="Centralizar"
            className="rounded p-1.5 text-white hover:bg-white/20"><AlignCenter className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); fmt("justifyRight"); }} title="Direita"
            className="rounded p-1.5 text-white hover:bg-white/20"><AlignRight className="h-4 w-4" /></button>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <button onMouseDown={(e) => { e.preventDefault(); setFontSize((s) => Math.max(8, s - 1)); }}
            className="rounded px-2 py-1 text-sm font-bold text-white hover:bg-white/20">A-</button>
          <span className="w-9 text-center text-xs text-white/80">{fontSize}pt</span>
          <button onMouseDown={(e) => { e.preventDefault(); setFontSize((s) => Math.min(20, s + 1)); }}
            className="rounded px-2 py-1 text-sm font-bold text-white hover:bg-white/20">A+</button>
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={() => setEditando((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              editando ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}>
            {editando ? <><Check className="h-4 w-4" /> Pronto</> : <><Pencil className="h-4 w-4" /> Editar</>}
          </button>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700">
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
          <button onClick={onFechar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-700">
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>

      {/* FOLHA A4 */}
      <div id="memorando-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", maxHeight: "297mm", overflow: "hidden",
          padding: "10mm 20mm 12mm 20mm",
          fontFamily: "Times New Roman, Times, serif", fontSize: pt, lineHeight: "1.45", position: "relative" }}>

        {/* Cabeçalho — 3 brasões: PMMA (esq) · Estado MA (centro-topo) · 18º BPM (dir) */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "3mm", marginBottom: "2mm" }}>

          {/* Brasão PMMA — esquerda (menor) */}
          <div style={{ width: "20mm", height: "20mm", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/brasao-pmma.png" alt="Brasão PMMA"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>

          {/* Texto central com o brasão do Estado MA acima (maior) */}
          <div style={{ flex: 1, textAlign: "center", lineHeight: "1.3" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
              <img src="/brasao-estado-ma.png" alt="Brasão do Estado do Maranhão"
                style={{ height: "17mm", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <p style={{ margin: 0, fontWeight: "bold", textTransform: "uppercase" }}>Estado do Maranhão</p>
            <p style={{ margin: 0, fontWeight: "bold", textTransform: "uppercase" }}>Secretaria de Estado da Segurança Pública</p>
            <p style={{ margin: 0, fontWeight: "bold", textTransform: "uppercase" }}>Polícia Militar do Maranhão</p>
            <p style={{ margin: 0, fontWeight: "bold", textTransform: "uppercase" }}>Comando do Policiamento de Área I/2</p>
            <p style={{ margin: 0, fontWeight: "bold", textTransform: "uppercase" }}>18º Batalhão de Policia Militar</p>
            <p style={{ margin: "1.5mm 0 0 0", fontSize: `${fontSize - 2}pt` }}>
              Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000
            </p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: `${fontSize - 2}pt` }}>
              TELEFAX: (99) 98509-5005 (Permanência) – <u>18batalhaopmma@gmail.com</u>
            </p>
          </div>

          {/* Brasão 18º BPM — direita (menor) */}
          <div style={{ width: "20mm", height: "20mm", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/brasao-18bpm.png" alt="Brasão 18º BPM"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        </div>

        <hr style={{ borderTop: "1.5px solid black", margin: "1mm 0 5mm 0" }} />

        {/* VISTO + Cidade/Data */}
        <div style={{ position: "relative", minHeight: "24mm", marginBottom: "6mm" }}>
          <div style={{ position: "absolute", left: 0, top: 0 }}>
            <p style={{ fontWeight: "bold", margin: "0 0 1mm 0" }}>VISTO</p>
            <div style={{ width: "38mm", height: "16mm", marginBottom: "1mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/assinatura-cmt.png" alt=""
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <p style={{ margin: 0, fontSize: `${fontSize - 1}pt` }}>Cmt. do 18º BPM</p>
          </div>

          {/* Cidade/Data — centralizado na página */}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "4mm", textAlign: "center", whiteSpace: "nowrap" }}>
            <C campo="cidadeData" style={{ display: "block", textAlign: "center" }} />
          </div>
        </div>

        {/* Número */}
        <p style={{ margin: "0 0 5mm 0" }}>
          Memorando nº <C campo="numero" />/{ano} – 18º BPM
        </p>

        {/* Do / Ao / Assunto */}
        <div style={{ marginLeft: "60mm", marginBottom: "6mm" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: "bold", verticalAlign: "top", paddingRight: "3mm", whiteSpace: "nowrap" }}>Do:</td>
                <td style={{ verticalAlign: "top", paddingBottom: "0.5mm" }}><C campo="de" /></td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", verticalAlign: "top", paddingRight: "3mm", whiteSpace: "nowrap" }}>Ao:</td>
                <td style={{ verticalAlign: "top", paddingBottom: "0.5mm" }}><C campo="ao" /></td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", verticalAlign: "top", paddingRight: "3mm", whiteSpace: "nowrap" }}>Assunto:</td>
                <td style={{ verticalAlign: "top" }}><C campo="assunto" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Corpo */}
        <p style={{ textAlign: "justify", textIndent: "15mm", marginBottom: "12mm" }}>
          Informo a Vossa Senhoria, para conhecimento que a partir do dia{" "}
          <C campo="inicioExtenso" />
          {", "}encontra-se de Férias Regulamentares (<C campo="dias" /> dias) referente ao exercício de{" "}
          <C campo="exercicio" />, devendo apresentar-se pronto para o serviço Policial Militar, no dia{" "}
          <C campo="apresExtenso" />.
        </p>

        {/* Assinatura do destinatário (mesma linha: posto + quadro/numero + nome) */}
        <div style={{ textAlign: "center", marginBottom: "10mm" }}>
          <C campo="assinaturaAo" style={{ display: "block", textAlign: "center" }} />
        </div>

        {/* Assinatura do emissor (Chefe P/1) — com a rubrica do Joelson acima do nome */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
            <img src="/assinatura-joelson.png" alt=""
              style={{ height: "16mm", objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
          <C campo="nomeCmt" style={{ display: "block", textAlign: "center" }} />
          <C campo="cargoCmt" style={{ display: "block", textAlign: "center" }} />
        </div>

      </div>

      <style>{`
        @media print {
          /* esconde tudo que esta fora do memorando (ex.: titulo "Plano de Ferias") */
          body * { visibility: hidden !important; }
          #memorando-print, #memorando-print * { visibility: visible !important; }
          #memorando-print {
            position: absolute !important;
            left: 0; top: 0;
            margin: 0 !important;
            box-shadow: none !important;
          }
          /* remove o fundo amarelo e o contorno dos campos editaveis na impressao */
          #memorando-print [contenteditable],
          #memorando-print [contenteditable="false"] {
            background: transparent !important;
            outline: none !important;
            padding: 0 !important;
          }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
}
