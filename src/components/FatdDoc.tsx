"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown, Loader2, Info } from "lucide-react";

/* =========================================================================
   FatdDoc — Formulário de Apuração de Transgressão Disciplinar (FATD).
   Peça pré-pronta, gerada a partir do registro do mapa de controle. O corpo é
   editável (contentEditable): o admin ajusta qualquer texto antes de imprimir /
   baixar PDF. O Word sai do servidor com o mesmo modelo preenchido pelo registro.
   Estrutura padrão (RDPM): I identificação · II transgressão · III instauração ·
   IV notificação/defesa · V decisão. Os "[ ]" viram "[X]" clicando e editando.
   ========================================================================= */

export type FatdRegistro = {
  id: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
  status: string; obs: string;
};

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "____/____/______");
}
const ANO = new Date().getFullYear();

// Rótulo + valor/branco. Se não houver valor, mostra um traço para preencher.
function Campo({ rot, val, min = "60mm" }: { rot: string; val?: string; min?: string }) {
  return (
    <p style={{ margin: "0 0 2mm" }}>
      <strong>{rot}:</strong>{" "}
      {val && val.trim()
        ? <span>{val}</span>
        : <span style={{ display: "inline-block", minWidth: min, borderBottom: "1px solid #000" }}>&nbsp;</span>}
    </p>
  );
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

  const conteudo = (
    <div id="fatd-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]">
          <Info className="h-3.5 w-3.5" /> Clique no documento para editar qualquer texto antes de imprimir. Marque com <b className="text-white">X</b> dentro dos [ ].
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
        style={{ width: "210mm", minHeight: "297mm", padding: "12mm 18mm", fontFamily: "Times New Roman, Times, serif", fontSize: "11.5pt", lineHeight: 1.4, position: "relative" }}
      >
        {/* Cabeçalho oficial (padrão da escala/permuta) */}
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }} contentEditable={false}>
          <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "26mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
            <img src="/brasoes/armas-ma.png" alt="" style={{ height: "16mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
          </div>
          <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 1mm" }}>
          FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR — FATD
        </h1>
        <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 6mm" }}>Nº {numero}</p>

        {/* I — Identificação do acusado */}
        <h2 style={sTit}>I — IDENTIFICAÇÃO DO(A) ACUSADO(A)</h2>
        <Campo rot="Posto/Graduação e Nome" val={reg.envolvido} min="90mm" />
        <Campo rot="Matrícula" min="50mm" />
        <div style={{ display: "flex", gap: "8mm" }}>
          <span><strong>Lotação/OPM:</strong> 18º BPM</span>
          <span><strong>Comportamento:</strong> <span style={ul("40mm")}>&nbsp;</span></span>
        </div>

        {/* II — Da transgressão apurada */}
        <h2 style={sTit}>II — DA TRANSGRESSÃO APURADA</h2>
        <p style={{ margin: "0 0 2mm", textAlign: "justify" }}>
          <strong>Descrição do fato (data, hora e local):</strong>{" "}
          {reg.objeto?.trim() ? reg.objeto : <span style={ul("100%")}>&nbsp;</span>}
        </p>
        <div style={{ borderBottom: "1px solid #000", height: "7mm" }} />
        <div style={{ borderBottom: "1px solid #000", height: "7mm" }} />
        <p style={{ margin: "3mm 0 2mm" }}>
          <strong>Enquadramento:</strong> transgressão prevista no art. <span style={ul("18mm")}>&nbsp;</span>,
          inciso <span style={ul("14mm")}>&nbsp;</span> do RDPM (Dec. Estadual nº ______).
        </p>
        <p style={{ margin: "0 0 2mm" }}>
          <strong>Natureza:</strong> &nbsp; [ &nbsp; ] Leve &nbsp;&nbsp; [ &nbsp; ] Média &nbsp;&nbsp; [ &nbsp; ] Grave
        </p>
        <p style={{ margin: "0 0 2mm" }}><strong>Testemunhas:</strong> <span style={ul("120mm")}>&nbsp;</span></p>

        {/* III — Da instauração */}
        <h2 style={sTit}>III — DA INSTAURAÇÃO</h2>
        <div style={{ display: "flex", gap: "8mm", flexWrap: "wrap" }}>
          <span><strong>Portaria:</strong> {reg.portaria?.trim() || <span style={ul("40mm")}>&nbsp;</span>}</span>
          <span><strong>Instaurado em:</strong> {dBR(reg.dataInstauracao)}</span>
          <span><strong>Prazo:</strong> {reg.prazo?.trim() ? dBR(reg.prazo) : <span style={ul("34mm")}>&nbsp;</span>}</span>
        </div>
        <Campo rot="Encarregado / Autoridade instauradora" val={reg.encarregado} min="90mm" />

        {/* IV — Notificação e defesa */}
        <h2 style={sTit}>IV — DA NOTIFICAÇÃO E DEFESA (a preencher pelo acusado)</h2>
        <p style={{ margin: "0 0 2mm" }}>
          Declaro ciência da presente acusação em <span style={ul("30mm")}>&nbsp;</span>, dispondo do prazo
          regulamentar para apresentar minhas razões de defesa e indicar testemunhas.
        </p>
        <p style={{ margin: "0 0 1mm" }}><strong>Razões de defesa:</strong></p>
        <div style={{ borderBottom: "1px solid #000", height: "7mm" }} />
        <div style={{ borderBottom: "1px solid #000", height: "7mm" }} />
        <div style={{ borderBottom: "1px solid #000", height: "7mm" }} />
        <div style={{ marginTop: "10mm", display: "flex", justifyContent: "center" }} contentEditable={false}>
          <div style={{ textAlign: "center", width: "80mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>Assinatura do(a) acusado(a)</div>
          </div>
        </div>

        {/* V — Da decisão */}
        <h2 style={sTit}>V — DA DECISÃO DA AUTORIDADE COMPETENTE</h2>
        <p style={{ margin: "0 0 2mm" }}>
          <strong>Do mérito:</strong> &nbsp; [ &nbsp; ] Transgressão <u>procedente</u> &nbsp;&nbsp; [ &nbsp; ] <u>Improcedente</u>
        </p>
        <p style={{ margin: "0 0 2mm" }}>
          <strong>Circunstâncias:</strong> atenuantes <span style={ul("55mm")}>&nbsp;</span> / agravantes <span style={ul("45mm")}>&nbsp;</span>
        </p>
        <p style={{ margin: "0 0 2mm" }}><strong>Punição aplicada:</strong></p>
        <p style={{ margin: "0 0 2mm" }}>
          [ &nbsp; ] Advertência &nbsp;&nbsp; [ &nbsp; ] Repreensão &nbsp;&nbsp;
          [ &nbsp; ] Detenção de <span style={ul("16mm")}>&nbsp;</span> dias &nbsp;&nbsp;
          [ &nbsp; ] Prisão de <span style={ul("16mm")}>&nbsp;</span> dias
        </p>
        <p style={{ margin: "0 0 2mm" }}>
          [ &nbsp; ] Licenciamento a bem da disciplina &nbsp;&nbsp; [ &nbsp; ] Exclusão a bem da disciplina
        </p>
        <p style={{ margin: "0 0 2mm" }}>
          <strong>Fundamentação:</strong> art. <span style={ul("20mm")}>&nbsp;</span> do RDPM. Fica o comportamento
          reclassificado para <span style={ul("40mm")}>&nbsp;</span>.
        </p>

        <p style={{ textAlign: "center", margin: "8mm 0 12mm" }} contentEditable={false}>
          São Luís/MA, ______ de ____________________ de {ANO}.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }} contentEditable={false}>
          <div style={{ textAlign: "center", width: "90mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>Autoridade competente</div>
            <div>Comandante do 18º BPM</div>
          </div>
        </div>
      </div>

      <style>{`
        #fatd-print h2 { break-after: avoid; }
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

const sTit: React.CSSProperties = {
  fontSize: "11.5pt", fontWeight: "bold", margin: "5mm 0 2mm", background: "#e9edf3",
  padding: "1.5mm 3mm", borderLeft: "3px solid #000",
};
function ul(w: string): React.CSSProperties {
  return { display: "inline-block", minWidth: w, borderBottom: "1px solid #000" };
}
