"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown, Loader2, Info } from "lucide-react";

/* =========================================================================
   FatdDoc — Formulário de Apuração de Transgressão Disciplinar (FATD).
   Reproduz FIELMENTE o modelo oficial do 18º BPM (Presidente Dutra-MA):
   cabeçalho + PROCESSO/DATA + Identificação do Militar + Identificação do
   Participante + Relato do Fato (+ assinatura do Chefe P/1) + Ciente do
   militar arrolado + Justificativas/Razões de Defesa + Decisão da autoridade.
   Corpo editável (contentEditable): o admin ajusta antes de imprimir/baixar.
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

export default function FatdDoc({ reg, onFechar }: { reg: FatdRegistro; onFechar: () => void }) {
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
  const enc = (reg.encarregado || "").trim();
  const mil = (reg.envolvido || "").trim();

  const conteudo = (
    <div id="fatd-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]">
          <Info className="h-3.5 w-3.5" /> Clique no documento para editar qualquer texto antes de imprimir.
        </span>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
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
        style={{ width: "210mm", minHeight: "297mm", padding: "12mm 18mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.35, position: "relative" }}
      >
        {/* Cabeçalho / timbre oficial */}
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }} contentEditable={false}>
          <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "24mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
            <img src="/brasoes/armas-ma.png" alt="" style={{ height: "15mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
          </div>
          <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>
        <p style={{ textAlign: "center", fontSize: "9pt", margin: "1mm 0 0", lineHeight: 1.2 }} contentEditable={false}>
          Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />
          TELEFAX: (99) 3663-3892 — 18batalhaopmma@gmail.com
        </p>

        <h1 style={{ textAlign: "center", fontSize: "12pt", fontWeight: "bold", margin: "6mm 0 3mm" }}>
          FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR
        </h1>

        <div style={boxLinha}>
          <span><strong>PROCESSO Nº</strong> {numero} — 18º BPM</span>
          <span style={{ marginLeft: "auto" }}><strong>DATA:</strong> {dataTopo}</span>
        </div>

        {/* Identificação do militar */}
        <div style={sBar}>IDENTIFICAÇÃO DO MILITAR</div>
        <div style={sBox}>
          <p style={pLin}><strong>Grau de Hierárquico:</strong> <span style={ul("55mm")}>&nbsp;</span> &nbsp; <strong>Nº Identidade:</strong> <span style={ul("35mm")}>&nbsp;</span> PMMA.</p>
          <p style={pLin}><strong>Nome Completo:</strong> {mil ? mil : <span style={ul("120mm")}>&nbsp;</span>}</p>
          <p style={pLin}><strong>Unidade:</strong> 18º Batalhão de Polícia Militar</p>
        </div>

        {/* Identificação do participante */}
        <div style={sBar}>IDENTIFICAÇÃO DO PARTICIPANTE</div>
        <div style={sBox}>
          <p style={pLin}><strong>Grau Hierárquico:</strong> {enc ? enc : <span style={ul("55mm")}>&nbsp;</span>} &nbsp; <strong>Nº Identidade:</strong> <span style={ul("35mm")}>&nbsp;</span> PMMA.</p>
          <p style={pLin}><strong>Nome Completo:</strong> <span style={ul("120mm")}>&nbsp;</span></p>
          <p style={pLin}><strong>Unidade:</strong> 18º Batalhão de Polícia Militar</p>
        </div>

        {/* Relato do fato */}
        <div style={sBar}>RELATO DO FATO</div>
        <div style={sBox}>
          <p style={{ ...pLin, textAlign: "justify", textIndent: "10mm" }}>
            Deveis justificar o motivo pelo qual, na data de {mil && !reg.objeto?.trim() ? <span style={ul("34mm")}>&nbsp;</span> : ""}
            {reg.objeto?.trim() ? reg.objeto : <><span style={ul("34mm")}>&nbsp;</span>, <span style={ul("100%")}>&nbsp;</span></>}.
          </p>
          <p style={{ textAlign: "center", margin: "6mm 0 12mm" }}>Presidente Dutra - MA, {dataExtenso(reg.dataInstauracao)}.</p>
          <div contentEditable={false} style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #000", width: "110mm", margin: "0 auto", paddingTop: "1mm", fontWeight: "bold", fontSize: "11pt" }}>
              {enc ? enc.toUpperCase() : "________________________"}
            </div>
            <div style={{ fontSize: "11pt", fontWeight: "bold" }}>CHEFE P/1 18º BPM</div>
          </div>
        </div>

        {/* Ciente do militar arrolado */}
        <div style={sBar}>CIENTE DO MILITAR ARROLADO</div>
        <div style={sBox}>
          <p style={{ ...pLin, textAlign: "justify", textIndent: "10mm" }}>
            Declaro que tenho conhecimento de que me está sendo imputada a autoria dos atos acima e me foi concedido o
            prazo de três dias úteis, para, querendo, apresentar, por escrito, as minhas justificativas ou razões de defesa.
          </p>
          <p style={{ textAlign: "center", margin: "6mm 0 12mm" }}>Presidente Dutra - MA, ____ /_________/ {ANO}.</p>
          <div contentEditable={false} style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #000", width: "110mm", margin: "0 auto", paddingTop: "1mm", fontWeight: "bold", fontSize: "11pt" }}>
              {mil ? mil.toUpperCase() : "________________________"}
            </div>
          </div>
        </div>

        {/* Justificativas / razões de defesa */}
        <div style={sBar}>JUSTIFICATIVAS / RAZÕES DE DEFESA</div>
        <div style={{ ...sBox, minHeight: "45mm" }}>
          <div style={{ borderBottom: "1px solid #000", height: "8mm" }} />
          <div style={{ borderBottom: "1px solid #000", height: "8mm" }} />
          <div style={{ borderBottom: "1px solid #000", height: "8mm" }} />
          <p style={{ textAlign: "center", margin: "6mm 0 12mm" }}>Presidente Dutra - MA, ______/ __________/ {ANO}.</p>
          <div contentEditable={false} style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #000", width: "110mm", margin: "0 auto", paddingTop: "1mm", fontWeight: "bold", fontSize: "11pt" }}>
              {mil ? mil.toUpperCase() : "________________________"}
            </div>
          </div>
        </div>

        {/* Decisão da autoridade competente */}
        <div style={sBar}>(DECISÃO DA AUTORIDADE COMPETENTE PARA APLICAR A PUNIÇÃO DISCIPLINAR)</div>
        <div style={{ ...sBox, minHeight: "40mm" }}>
          <div style={{ borderBottom: "1px solid #000", height: "8mm" }} />
          <div style={{ borderBottom: "1px solid #000", height: "8mm" }} />
          <p style={{ textAlign: "center", margin: "6mm 0 12mm" }}>Presidente Dutra - MA, _______/ __________/ {ANO}.</p>
          <div contentEditable={false} style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #000", width: "70mm", margin: "0 auto", paddingTop: "1mm" }}>Autoridade Competente</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#fatd-overlay) { display: none !important; }
          #fatd-overlay { position: static !important; overflow: visible !important; background: #fff !important; inset: auto !important; display: block !important; }
          #fatd-print { position: static !important; margin: 0 auto !important; box-shadow: none !important; min-height: 0 !important; width: 100% !important; padding: 10mm 16mm !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(conteudo, document.body);
}

const sBar: React.CSSProperties = {
  fontWeight: "bold", textAlign: "center", fontSize: "11pt", background: "#e4e4e4",
  border: "1px solid #000", borderBottom: "none", padding: "1.5mm 3mm",
};
const sBox: React.CSSProperties = { border: "1px solid #000", padding: "3mm 4mm", marginBottom: "3mm" };
const pLin: React.CSSProperties = { margin: "0 0 2mm" };
const boxLinha: React.CSSProperties = { display: "flex", border: "1px solid #000", padding: "2mm 3mm", margin: "0 0 3mm", fontSize: "11pt" };
