"use client";

import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Pencil, Check, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export type DadosMemorando = {
  numero: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  quadro: string;            // QOE / QOEM (oficiais) — vazio para praças
  ehOficial: boolean;
  inicioBR: string;
  apresentacaoBR: string;
  diasFerias: number;
  nomeGuerra?: string;       // opcional: trecho do nome a destacar em negrito (ex.: "CESAR SANTOS")
  horaApresentacao?: string; // opcional: ex. "07h30min" -> sai ", às 07h30min" (default "07h30min"); passe "" para sem hora
  observacao?: string;       // opcional: texto da OBS. undefined = OBS padrão; "" = sem OBS
};

const OBS_PADRAO =
  "OBS: O Policial Militar em tela deve devolver todos os materiais, equipamentos, armamentos e munições, pertencentes 18º BPM.";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hojeExtenso() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${pad2(d.getDate())} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function dataExtenso(br: string): string {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return br;
  return `${pad2(parseInt(m[1]))} de ${meses[parseInt(m[2]) - 1]} de ${m[3]}`;
}

// Abrevia o posto/graduação no padrão dos memorandos.
// caixaAlta=true  -> "CB" / "SD" (linha de assinatura)
// caixaAlta=false -> "Cb" / "Sd" (linha do Ao)
function abreviaPosto(posto: string, caixaAlta: boolean): string {
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
    "cabo": caixaAlta ? "CB" : "Cb",
    "soldado": caixaAlta ? "SD" : "Sd",
  };
  return mapa[p] ?? posto;
}

// Title Case para nomes em português (mantém conectivos minúsculos).
function tituloNome(nome: string): string {
  const minus = new Set(["de", "da", "do", "das", "dos", "e"]);
  return (nome || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (minus.has(w) && i !== 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Envolve o nome de guerra em <strong> dentro do nome já formatado.
// Formata o "guerra" na MESMA caixa do nome para o replace bater.
function destacaGuerra(nomeFormatado: string, guerra: string | undefined, caixaAlta: boolean): string {
  if (!guerra || !guerra.trim()) return nomeFormatado;
  const alvo = caixaAlta ? guerra.trim().toUpperCase() : tituloNome(guerra.trim());
  if (!alvo) return nomeFormatado;
  const idx = nomeFormatado.indexOf(alvo);
  if (idx < 0) return nomeFormatado;
  return (
    nomeFormatado.slice(0, idx) +
    `<strong>${alvo}</strong>` +
    nomeFormatado.slice(idx + alvo.length)
  );
}

// Linha do Ao (caixa-título). Praça: "Cb PM nº 438/14- Carlos César Santos Guimarães"
// Oficial: "Cap. QOEM Rurik Ramos Trinta"
function linhaAo(d: DadosMemorando): string {
  const nome = destacaGuerra(tituloNome(d.nome), d.nomeGuerra, false);
  if (d.ehOficial) {
    const posto = abreviaPosto(d.postoGrad, false);
    const quadro = (d.quadro || "").trim();
    const meio = quadro ? `${posto} ${quadro}` : posto;
    return `${meio} ${nome}`;
  }
  const posto = abreviaPosto(d.postoGrad, false);
  const barra = (d.numeroBarra || "").trim();
  return `${posto} PM nº ${barra}- ${nome}`;
}

// Linha de assinatura do destinatário (CAIXA-ALTA).
// Praça: "CB PM Nº 438/14- CARLOS CÉSAR SANTOS GUIMARÃES"
// Oficial: "CAP. QOEM RURIK RAMOS TRINTA"
function linhaAssinaturaDestino(d: DadosMemorando): string {
  const nomeUp = (d.nome || "").toUpperCase();
  if (d.ehOficial) {
    const posto = abreviaPosto(d.postoGrad, true).toUpperCase();
    const quadro = (d.quadro || "").trim().toUpperCase();
    const meio = quadro ? `${posto} ${quadro}` : posto;
    return `${meio} ${destacaGuerra(nomeUp, d.nomeGuerra, true)}`;
  }
  const posto = abreviaPosto(d.postoGrad, true);
  const barra = (d.numeroBarra || "").trim();
  return `${posto} PM Nº ${barra}- ${destacaGuerra(nomeUp, d.nomeGuerra, true)}`;
}

// Campo editável com contentEditable — suporta bold/italic/underline via execCommand.
// Salva a edição no ref a CADA digitação (onInput), de modo que o conteúdo nunca
// se perde ao sair do modo de edição ou ao re-renderizar.
function Campo({
  html, editando, style, multiline, onCommit,
}: {
  html: string; editando: boolean; style?: React.CSSProperties; multiline?: boolean;
  onCommit?: (novoHtml: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, editando]);

  return (
    <div
      ref={ref}
      contentEditable={editando}
      suppressContentEditableWarning
      onInput={() => { if (ref.current && onCommit) onCommit(ref.current.innerHTML); }}
      onBlur={() => { if (ref.current && onCommit) onCommit(ref.current.innerHTML); }}
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
    />
  );
}

// Renderiza o conteudo diretamente no <body> via portal. Isso permite, na
// impressao, dar display:none em todo o resto do app (body > *) sem esconder o
// memorando — eliminando as paginas em branco causadas por visibility:hidden,
// que esconde mas mantem o espaco ocupado.
function Portal({ montado, children }: { montado: boolean; children: React.ReactNode }) {
  if (!montado || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export default function MemorandoFerias({ dados, ano, onFechar }: {
  dados: DadosMemorando; ano: string; onFechar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const [montado, setMontado] = useState(false);

  useEffect(() => { setMontado(true); }, []);

  const pt = `${fontSize}pt`;

  const aoHtml = linhaAo(dados);
  const assinaturaHtml = linhaAssinaturaDestino(dados);

  const hora = dados.horaApresentacao === undefined ? "07h30min" : dados.horaApresentacao.trim();
  const apresTexto = `${dataExtenso(dados.apresentacaoBR)}${hora ? `, às ${hora}` : ""}`;

  const obsInicial = dados.observacao === undefined ? OBS_PADRAO : dados.observacao;
  const temObs = obsInicial.trim() !== "";

  const campos = {
    numero:        useRef(`${dados.numero}`),
    cidadeData:    useRef(`Presidente Dutra-MA, ${hojeExtenso()}.`),
    de:            useRef(`1º Ten QOEM Chefe da 1ª Seção do 18º BPM.`),
    ao:            useRef(`${aoHtml}.`),
    assunto:       useRef(`Concessão de Férias (${dados.diasFerias} dias).`),
    inicioExtenso: useRef(`<strong><u>${dataExtenso(dados.inicioBR)}</u></strong>`),
    apresExtenso:  useRef(`<strong><u>${apresTexto}</u></strong>`),
    dias:          useRef(`${dados.diasFerias}`),
    exercicio:     useRef(`${Number(ano) - 1}`),
    observacao:    useRef(obsInicial),
    assinaturaAo:  useRef(`${assinaturaHtml}`),
    nomeCmt:       useRef(`1º TEN. QOEM <strong>JOELSON</strong> DOS REIS SILVA`),
    cargoCmt:      useRef(`CHEFE DO P/1 DO 18º BPM`),
  };

  function fmt(cmd: string) {
    document.execCommand(cmd, false, undefined);
  }

  const C = ({ campo, style, multiline }: {
    campo: keyof typeof campos; style?: React.CSSProperties; multiline?: boolean;
  }) => (
    <Campo
      key={`campo-${campo}`}
      html={campos[campo].current}
      editando={editando}
      style={style}
      multiline={multiline}
      onCommit={(novo) => { campos[campo].current = novo; }}
    />
  );

  return (
    <Portal montado={montado}>
    <div id="memorando-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">

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
        style={{ width: "210mm", minHeight: "297mm",
          padding: "10mm 20mm 12mm 20mm",
          fontFamily: "Times New Roman, Times, serif", fontSize: pt, lineHeight: "1.45", position: "relative" }}>

        {/* CABECALHO — 3 colunas:
            ESQUERDA: brasao PMMA + VISTO + assinatura do Cmt. + "Cmt. do 18 BPM"
            CENTRO:   brasao do Estado do MA + textos do orgao + cidade/data
            DIREITA:  brasao do 18 BPM */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "2mm", marginBottom: "5mm" }}>

          {/* Coluna esquerda */}
          <div style={{ width: "38mm", flexShrink: 0, textAlign: "left" }}>
            <div style={{ width: "22mm", height: "22mm", marginBottom: "3mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/brasao-pmma.png" alt="Brasao PMMA"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <p style={{ fontWeight: "bold", margin: "0 0 1mm 0" }}>VISTO</p>
            <div style={{ width: "34mm", height: "15mm", marginBottom: "1mm", display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
              <img src="/assinatura-cmt.png" alt=""
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <p style={{ margin: 0 }}>Cmt. do 18º BPM</p>
          </div>

          {/* Coluna central */}
          <div style={{ flex: 1, textAlign: "center", lineHeight: "1.25" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
              <img src="/brasao-estado-ma.png" alt="Brasao do Estado do Maranhao"
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

            {/* Cidade/Data — alinhada com "Cmt. do 18 BPM" da coluna esquerda */}
            <div style={{ marginTop: "7mm" }}>
              <C campo="cidadeData" style={{ display: "block", textAlign: "center" }} />
            </div>
          </div>

          {/* Coluna direita */}
          <div style={{ width: "22mm", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
            <div style={{ width: "22mm", height: "22mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/brasao-18bpm.png" alt="Brasao 18 BPM"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
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
        <p style={{ textAlign: "justify", textIndent: "15mm", marginBottom: temObs ? "4mm" : "22mm" }}>
          Informo a Vossa Senhoria, para conhecimento que a partir do dia{" "}
          <C campo="inicioExtenso" />
          {", "}encontra-se de Férias Regulamentares (<C campo="dias" /> dias) referente ao exercício de{" "}
          <C campo="exercicio" />, devendo apresentar-se pronto para o serviço Policial Militar, no dia{" "}
          <C campo="apresExtenso" />.
        </p>

        {/* OBS (opcional) */}
        {temObs && (
          <p style={{ textAlign: "justify", textIndent: "15mm", marginBottom: "20mm" }}>
            <C campo="observacao" multiline />
          </p>
        )}

        {/* Assinatura do destinatário (CAIXA-ALTA, nome de guerra em negrito) */}
        <div style={{ textAlign: "center", marginBottom: "22mm" }}>
          <C campo="assinaturaAo" style={{ display: "block", textAlign: "center" }} />
        </div>

        {/* Assinatura do emissor (Chefe P/1) — rubrica do Joelson acima do nome */}
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
          /* com o overlay portado para o body, escondemos todo o resto do app.
             display:none (e nao visibility:hidden) zera tambem o espaco ocupado,
             evitando paginas em branco. */
          body > *:not(#memorando-overlay) { display: none !important; }
          #memorando-overlay {
            position: static !important;
            overflow: visible !important;
            background: transparent !important;
            inset: auto !important;
            display: block !important;
          }
          #memorando-print {
            position: static !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            /* sem altura minima de 297mm — encolhe ao tamanho do conteudo,
               assim nao sobra uma 2a pagina em branco */
            min-height: 0 !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            overflow: visible !important;
            padding: 12mm 16mm !important;
          }
          /* zera fundo amarelo, contorno e bordas de TODOS os campos */
          #memorando-print [contenteditable],
          #memorando-print [contenteditable="true"],
          #memorando-print [contenteditable="false"] {
            background: transparent !important;
            outline: none !important;
            border: none !important;
            padding: 0 !important;
          }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; background: #fff !important; }
          /* margin:0 no @page ajuda a suprimir o cabecalho/rodape automatico do navegador */
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
    </Portal>
  );
}
