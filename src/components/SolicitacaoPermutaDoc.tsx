"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, ShieldCheck } from "lucide-react";

export type PermutaDoc = {
  id: string;
  solicitante: { nome: string; linha: string; em: string };
  solicitadoNome: string;
  solicitado: { nome: string; linha: string; em: string } | null;
  dataPermuta: string;
  dataRetorno: string;
  motivo: string;
  estado: string;
  parecerP1: string | null;
  p1Nome: string | null;
  p1Em: string | null;
  visto: "autorizado" | "nao_autorizado" | null;
};

function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Assinado({ titulo, linha, nome, em }: { titulo: string; linha: string; nome: string; em: string | null }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "6px 10px" }}>
      <p style={{ margin: 0, fontWeight: "bold" }}>{titulo}</p>
      {em ? (
        <>
          <p style={{ margin: "6px 0 2px", fontSize: "9pt" }}>Documento assinado digitalmente</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #1351b4", borderRadius: 4, padding: "3px 8px", margin: "0 auto" }}>
            <span style={{ fontWeight: "bold", color: "#1351b4", fontSize: "10pt" }}>SIGEP</span>
            <span style={{ textAlign: "left", fontSize: "7.5pt", lineHeight: 1.15 }}>
              <span style={{ display: "block", fontWeight: "bold" }}>{(nome || linha).toUpperCase()}</span>
              <span style={{ display: "block" }}>Assinado em {dataHora(em)}</span>
              <span style={{ display: "block" }}>18º BPM · login individual</span>
            </span>
          </div>
        </>
      ) : (
        <p style={{ margin: "14px 0", fontSize: "9pt", color: "#888", fontStyle: "italic" }}>aguardando assinatura</p>
      )}
      <div style={{ borderTop: "1px solid #000", marginTop: 8, paddingTop: 3, fontWeight: "bold" }}>{linha}</div>
    </div>
  );
}

export default function SolicitacaoPermutaDoc({ doc, onFechar }: { doc: PermutaDoc; onFechar: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado || typeof document === "undefined") return null;

  const conteudo = (
    <div id="permuta-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div id="permuta-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 20mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.4, position: "relative" }}>

        {/* Cabecalho com brasoes */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "4mm" }}>
          <img src="/brasao-pmma.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.25 }}>
            <img src="/brasao-estado-ma.png" alt="" style={{ height: "16mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
          </div>
          <img src="/brasao-18bpm.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "10mm 0 8mm" }}>SOLICITAÇÃO DE PERMUTA</h1>

        <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 10mm" }}>
          Eu, <strong>{doc.solicitante.linha}</strong>, integrante do 18º BPM, venho solicitar que seja
          autorizado permuta de serviço com o policial militar <strong>{doc.solicitado?.linha || doc.solicitadoNome}</strong>,
          para a data de <strong>{dBR(doc.dataPermuta)}</strong>, com retorno para a data <strong>{dBR(doc.dataRetorno)}</strong>
          {doc.motivo ? <> por motivos <strong>{doc.motivo}</strong></> : null}.
        </p>

        {/* Assinaturas */}
        <div style={{ display: "flex", gap: 0, border: "1px solid #000", marginBottom: "4mm" }}>
          <div style={{ flex: 1, borderRight: "1px solid #000" }}>
            <Assinado titulo="SOLICITANTE" linha={doc.solicitante.linha} nome={doc.solicitante.nome} em={doc.solicitante.em} />
          </div>
          <div style={{ flex: 1 }}>
            <Assinado titulo="SOLICITADO" linha={doc.solicitado?.linha || doc.solicitadoNome} nome={doc.solicitado?.nome || ""} em={doc.solicitado?.em || null} />
          </div>
        </div>

        <p style={{ fontSize: "9.5pt", fontStyle: "italic", fontWeight: "bold", margin: "0 0 14mm" }}>
          (Obs: A solicitação deve ser assinada digitalmente e entregue COM 48H ANTES DO DIA DA PERMUTA PRETENDIDA)
        </p>

        {/* Parecer / Visto */}
        <div style={{ display: "flex", gap: 0, border: "1px solid #000" }}>
          <div style={{ flex: 1, borderRight: "1px solid #000", padding: "6px 10px", minHeight: "38mm" }}>
            <p style={{ textAlign: "center", margin: "0 0 6px" }}>Parecer do Chefe do P1</p>
            {doc.parecerP1 ? (
              <p style={{ fontSize: "10pt" }}>{doc.parecerP1}</p>
            ) : (
              <>
                <div style={{ borderBottom: "1px solid #000", margin: "10mm 6mm 6mm" }} />
                <div style={{ borderBottom: "1px solid #000", margin: "0 6mm" }} />
              </>
            )}
            {doc.p1Nome && <p style={{ fontSize: "8.5pt", marginTop: 8, textAlign: "center" }}>{doc.p1Nome} · {dataHora(doc.p1Em)}</p>}
          </div>
          <div style={{ flex: 1, padding: "6px 10px" }}>
            <p style={{ textAlign: "center", margin: "0 0 10px" }}>Visto do Subcomandante do 18ºBPM</p>
            <p style={{ margin: "8px 0" }}>
              <span style={{ display: "inline-block", width: 14, height: 14, border: "1px solid #000", marginRight: 8, textAlign: "center", lineHeight: "13px", verticalAlign: "middle" }}>
                {doc.visto === "autorizado" ? "X" : ""}
              </span>
              Autorizado
            </p>
            <p style={{ margin: "8px 0" }}>
              <span style={{ display: "inline-block", width: 14, height: 14, border: "1px solid #000", marginRight: 8, textAlign: "center", lineHeight: "13px", verticalAlign: "middle" }}>
                {doc.visto === "nao_autorizado" ? "X" : ""}
              </span>
              Não Autorizado
            </p>
          </div>
        </div>

        <p className="print:hidden" style={{ marginTop: 10, fontSize: "8pt", color: "#999", display: "flex", alignItems: "center", gap: 4 }}>
          <ShieldCheck style={{ width: 12, height: 12 }} /> Assinaturas registradas pelo login individual no SIGEP (não são carimbo do gov.br).
        </p>
      </div>

      <style>{`
        @media print {
          body > *:not(#permuta-overlay) { display: none !important; }
          #permuta-overlay { position: static !important; overflow: visible !important; background: #fff !important; inset: auto !important; display: block !important; }
          #permuta-print { position: static !important; margin: 0 auto !important; box-shadow: none !important; min-height: 0 !important; width: 100% !important; padding: 12mm 16mm !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(conteudo, document.body);
}
