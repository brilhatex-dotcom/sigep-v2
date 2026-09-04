"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown, Loader2, Info } from "lucide-react";
import { imprimirElemento } from "@/lib/imprimir";
import { assinanteFatd, type DadosPessoa } from "@/lib/refMilitar";

/* =========================================================================
   FatdDoc — Formulário de Apuração de Transgressão Disciplinar (FATD).

   Copiado do modelo oficial em Word do 18º BPM (FATD nº 006/26): UMA moldura
   por página, com as divisões internas do formulário; brasão do Estado
   sozinho no alto; títulos de seção centralizados em negrito, SEM faixa
   cinza; relato em itálico; e, na 2ª página, as linhas em branco onde o
   militar escreve à mão (13 na justificativa, 12 na decisão).

   As medidas vêm do modelo: moldura de 186mm, régua de assinatura de 153mm
   (77mm na da autoridade), linha de escrita de 5mm.

   O texto continua editável (contentEditable) para o P/1 ajustar antes de
   imprimir ou baixar.
   ========================================================================= */

export type FatdRegistro = {
  id: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
  status: string; obs: string;
};

const ANO = new Date().getFullYear();
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataExtenso(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `______ de ____________________ de ${ANO}`;
  return `${m[3]} de ${MESES[Number(m[2]) - 1] || "____"} de ${m[1]}`;
}
function ul(w: string): React.CSSProperties {
  return { display: "inline-block", minWidth: w, borderBottom: "1px solid #000" };
}
export type { DadosPessoa } from "@/lib/refMilitar";

export default function FatdDoc({ reg, mil: milD, enc: encD, chefeP1 = "", comandante = "", onFechar }: { reg: FatdRegistro; mil?: DadosPessoa | null; enc?: DadosPessoa | null; chefeP1?: string; comandante?: string; onFechar: () => void }) {
  const [montado, setMontado] = useState(false);
  const [baixandoWord, setBaixandoWord] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado || typeof document === "undefined") return null;

  async function baixarWord() {
    setBaixandoWord(true);
    try {
      const res = await fetch(`/api/disciplinar/fatd-docx?id=${encodeURIComponent(reg.id)}`);
      if (!res.ok) { alert("Não foi possível gerar o Word."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FATD_${(reg.numero || "sn").replace(/[^\w]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Erro de conexão ao gerar o Word."); }
    finally { setBaixandoWord(false); }
  }

  const numero = (reg.numero || "").trim() || `______/${ANO}`;
  const dataTopo = (reg.dataInstauracao || "").match(/^(\d{4})-(\d{2})-(\d{2})/)
    ? `${reg.dataInstauracao.slice(8, 10)}/${reg.dataInstauracao.slice(5, 7)}/${reg.dataInstauracao.slice(0, 4)}`
    : "____/____/______";
  // Participante do FATD = Chefe do P/1. Usa o campo do registro se preenchido;
  // senão, o Chefe do P/1 configurado na Escala (fonte única).
  const enc = (reg.encarregado || "").trim() || (chefeP1 || "").trim();
  const mil = (reg.envolvido || "").trim();
  const assMil = assinanteFatd(milD, mil);
  const assEnc = assinanteFatd(encD, enc);

  // Linha em branco para escrever à mão (5mm, como no modelo).
  const regua = (n: number) =>
    Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ borderBottom: BORDA, height: "5mm" }} />
    ));

  const rubrica = (nome: string, cargo?: string, largura = "153mm") => (
    <div contentEditable={false} style={{ textAlign: "center" }}>
      <div style={{ borderTop: BORDA, width: largura, margin: "0 auto", paddingTop: "0.8mm" }}>
        {nome || "________________________"}
      </div>
      {cargo && <div>{cargo}</div>}
    </div>
  );

  const conteudo = (
    <div id="fatd-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]">
          <Info className="h-3.5 w-3.5" /> Clique no documento para editar qualquer texto antes de imprimir.
        </span>
        <button onClick={() => imprimirElemento(document.getElementById("fatd-print"), { titulo: `FATD ${reg.numero || ""}` })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <Printer className="h-4 w-4" /> Baixar PDF
        </button>
        <button onClick={baixarWord} disabled={baixandoWord} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60">
          {baixandoWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {baixandoWord ? "Gerando..." : "Baixar Word"}
        </button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div
        id="fatd-print"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="mx-auto my-6 bg-white text-black shadow-2xl outline-none print:my-0 print:shadow-none"
        style={{ width: "210mm", padding: "12mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.3 }}
      >
        {/* ===================== PÁGINA 1 ===================== */}
        <div style={{ border: BORDA, display: "flex", flexDirection: "column", minHeight: "268mm" }}>
          {/* timbre: no modelo só o brasão do Estado, e o órgão sem negrito */}
          <div style={{ ...celula, textAlign: "center", paddingTop: "2mm" }} contentEditable={false}>
            <img src="/brasao-estado-ma.png" alt="" style={{ height: "14mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }}
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0 }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0 }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
            <p style={{ margin: 0 }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0 }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
            <p style={{ margin: 0 }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
            <p style={{ margin: 0, fontSize: "9pt" }}>Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000</p>
            <p style={{ margin: 0, fontSize: "9pt", fontWeight: "bold" }}>TELEFAX: (99) 3663-3892 – 18batalhaopmma@gmail.com</p>
            <p style={{ margin: "2mm 0 0", fontWeight: "bold" }}>FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR</p>
          </div>

          <div style={{ ...celula, display: "flex", fontWeight: "bold" }}>
            <span>PROCESSO Nº {numero} – 18º BPM</span>
            <span style={{ marginLeft: "auto" }}>DATA: {dataTopo}</span>
          </div>

          <div style={celula}>
            <p style={titulo}>IDENTIFICAÇÃO DO MILITAR</p>
            <p style={linha}>
              <b>Grau Hierárquico:</b> {milD?.grau ? <i>{milD.grau}</i> : <span style={ul("50mm")}>&nbsp;</span>}
              &nbsp;&nbsp;&nbsp;&nbsp;<b>Nº Identidade:</b> {milD?.rg ? milD.rg : <span style={ul("32mm")}>&nbsp;</span>} – PMMA.
            </p>
            <p style={linha}><b>Nome Completo:</b> {milD?.nome || mil || <span style={ul("120mm")}>&nbsp;</span>}</p>
            <p style={linha}><b>Unidade:</b> <i>18º Batalhão de Polícia Militar</i></p>
          </div>

          <div style={celula}>
            <p style={titulo}>IDENTIFICAÇÃO DO PARTICIPANTE</p>
            <p style={linha}>
              <b>Grau Hierárquico:</b> {encD?.grau ? <i>{encD.grau}</i> : <span style={ul("50mm")}>&nbsp;</span>}
              &nbsp;&nbsp;&nbsp;&nbsp;<b>Nº Identidade:</b> {encD?.rg ? encD.rg : <span style={ul("32mm")}>&nbsp;</span>} – PMMA.
            </p>
            <p style={linha}><b>Nome Completo:</b> {encD?.nome || enc || <span style={ul("120mm")}>&nbsp;</span>}</p>
            <p style={linha}><b>Unidade:</b> <i>18º Batalhão de Polícia Militar</i></p>
          </div>

          {/* No modelo o relato e o ciente ficam no MESMO quadro — não há
              divisória entre a assinatura do Chefe do P/1 e o ciente. */}
          <div style={{ ...celula, borderBottom: "none", flex: 1 }}>
            <p style={titulo}>RELATO DO FATO</p>
            <p style={{ margin: 0, textAlign: "justify", textIndent: "10mm", fontStyle: "italic", lineHeight: 1.7 }}>
              Deveis justificar o motivo pelo qual, na data de{" "}
              {reg.objeto?.trim() ? reg.objeto.trim().replace(/\.*$/, "") : <><span style={ul("34mm")}>&nbsp;</span>, <span style={ul("110mm")}>&nbsp;</span></>}.
            </p>
            <p style={{ textAlign: "center", margin: "8mm 0 0" }}>Presidente Dutra - MA, {dataExtenso(reg.dataInstauracao)}.</p>
            <div style={{ marginTop: "16mm" }}>{rubrica(assEnc, "CHEFE P/1 18º BPM")}</div>

            <p style={{ ...titulo, marginTop: "6mm" }}>CIENTE DO MILITAR ARROLADO</p>
            <p style={{ margin: 0, textAlign: "justify", textIndent: "10mm" }}>
              Declaro que tenho conhecimento de que me está sendo imputada à autoria dos atos acima e me foi
              concedido o prazo de três dias úteis, para, querendo, apresentar, por escrito, as minhas
              justificativas ou razões de defesa.
            </p>
            <p style={{ textAlign: "center", margin: "7mm 0 0" }}>Presidente Dutra- MA, ____ /_________/ {ANO}.</p>
            <div style={{ marginTop: "22mm" }}>{rubrica(assMil)}</div>
          </div>
        </div>

        {/* ===================== PÁGINA 2 ===================== */}
        <div style={{ border: BORDA, pageBreakBefore: "always", breakBefore: "page", marginTop: "6mm" }}>
          <div style={{ ...celula, ...titulo, padding: "5mm 3mm" }}>JUSTIFICATIVAS / RAZÕES DE DEFESA</div>
          {regua(13)}
          <div style={{ ...celula, padding: "4mm 3mm" }}>
            <p style={{ textAlign: "center", margin: 0 }}>Presidente Dutra- MA, ______/ __________/ {ANO}.</p>
            <div style={{ marginTop: "16mm" }}>{rubrica(assMil)}</div>
          </div>

          <div style={{ ...celula, ...titulo, padding: "6mm 3mm" }}>(DECISÃO DA AUTORIDADE COMPETENTE PARA APLICAR A PUNIÇÃO DISCIPLINAR)</div>
          {regua(12)}
          <div style={{ padding: "4mm 3mm" }}>
            <p style={{ textAlign: "center", margin: 0 }}>Presidente Dutra-MA, _______/ __________/ {ANO}.</p>
            {/* No modelo esta linha não leva o nome do Comandante: fica só
                "Autoridade Competente", para quem assinar preencher. */}
            <div style={{ marginTop: "13mm" }}>{rubrica("Autoridade Competente", undefined, "77mm")}</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#fatd-overlay) { display: none !important; }
          #fatd-overlay { position: static !important; overflow: visible !important; background: #fff !important; inset: auto !important; display: block !important; }
          #fatd-print { position: static !important; margin: 0 auto !important; box-shadow: none !important; width: 100% !important; padding: 12mm !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(conteudo, document.body);
}

const BORDA = "1px solid #000";
// Cada faixa do formulário: divisória embaixo e um respiro nas laterais.
const celula: React.CSSProperties = { borderBottom: BORDA, padding: "1mm 3mm" };
const titulo: React.CSSProperties = { fontWeight: "bold", textAlign: "center", margin: "0 0 0.5mm" };
const linha: React.CSSProperties = { margin: 0 };
