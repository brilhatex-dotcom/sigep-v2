"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, ShieldCheck, FileDown, Loader2 } from "lucide-react";
import QrCode from "@/components/QrCode";
import { imprimirElemento } from "@/lib/imprimir";

export type PermutaDoc = {
  id: string;
  protocolo?: string;
  verifToken?: string;
  solicitante: { nome: string; linha: string; em: string };
  solicitadoNome: string;
  solicitado: { nome: string; linha: string; em: string } | null;
  dataPermuta: string;
  dataRetorno: string;
  motivo: string;
  estado: string;
  parecerP1: string | null;
  p1Nome: string | null;
  p1Cargo?: string | null;
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

function Assinado({ titulo, linha, nome, em, qrUrl }: { titulo: string; linha: string; nome: string; em: string | null; qrUrl?: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "6px 10px" }}>
      <p style={{ margin: 0, fontWeight: "bold" }}>{titulo}</p>
      {em ? (
        <>
          <p style={{ margin: "6px 0 2px", fontSize: "9pt" }}>Documento assinado digitalmente</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #1351b4", borderRadius: 4, padding: "3px 8px", margin: "0 auto" }}>
            {qrUrl ? <QrCode url={qrUrl} size={54} /> : null}
            <span style={{ textAlign: "left", fontSize: "7.5pt", lineHeight: 1.15 }}>
              <span style={{ display: "block", fontWeight: "bold", color: "#1351b4" }}>SIGEP · {(nome || linha).toUpperCase()}</span>
              <span style={{ display: "block" }}>Assinado em {dataHora(em)}</span>
              <span style={{ display: "block" }}>18º BPM · login individual</span>
              <span style={{ display: "block", color: "#555" }}>Aponte a câmera no QR p/ verificar</span>
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
  const [baixandoWord, setBaixandoWord] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado || typeof document === "undefined") return null;

  // URL pública de verificação (QR). Só monta se houver protocolo + token.
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const verifUrl = (a: string) =>
    doc.protocolo && doc.verifToken
      ? `${base}/verificar/permuta/${encodeURIComponent(doc.protocolo)}?t=${encodeURIComponent(doc.verifToken)}&a=${a}`
      : "";

  async function baixarWord() {
    setBaixandoWord(true);
    try {
      const res = await fetch(`/api/permutas/docx?id=${encodeURIComponent(doc.id)}`);
      if (!res.ok) { alert("Não foi possível gerar o Word."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Permuta_${doc.solicitante.linha.replace(/[^\w]+/g, "_")}_${doc.dataPermuta}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Erro de conexão ao gerar o Word."); }
    finally { setBaixandoWord(false); }
  }

  const conteudo = (
    <div id="permuta-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <button onClick={() => imprimirElemento(document.getElementById("permuta-print"), { titulo: `Permuta ${doc.protocolo || ""}` })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <Printer className="h-4 w-4" /> Baixar PDF
        </button>
        <button onClick={baixarWord} disabled={baixandoWord} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60">
          {baixandoWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {baixandoWord ? "Gerando..." : "Baixar Word"}
        </button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div id="permuta-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 20mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.4, position: "relative" }}>

        {/* Cabecalho com brasoes — mesmo padrao da escala diaria:
            esquerda: 190 anos PMMA · centro: armas da PMMA (acima do texto) ·
            direita: 18º BPM. (Sem o brasao do Governo do Estado.) */}
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
          <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "28mm", height: "24mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.25 }}>
            <img src="/brasoes/armas-ma.png" alt="" style={{ height: "17mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
          </div>
          <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "10mm 0 1mm" }}>SOLICITAÇÃO DE PERMUTA</h1>
        {doc.protocolo ? <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 8mm" }}>PERMUTA Nº {doc.protocolo}</p> : <div style={{ marginBottom: "8mm" }} />}

        <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 10mm" }}>
          Eu, <strong>{doc.solicitante.linha}</strong>, integrante do 18º BPM, venho solicitar que seja
          autorizado permuta de serviço com o policial militar <strong>{doc.solicitado?.linha || doc.solicitadoNome}</strong>,
          para a data de <strong>{dBR(doc.dataPermuta)}</strong>, com retorno para a data <strong>{dBR(doc.dataRetorno)}</strong>
          {doc.motivo ? <> por motivos <strong>{doc.motivo}</strong></> : null}.
        </p>

        {/* Assinaturas */}
        <div style={{ display: "flex", gap: 0, border: "1px solid #000", marginBottom: "4mm" }}>
          <div style={{ flex: 1, borderRight: "1px solid #000" }}>
            <Assinado titulo="SOLICITANTE" linha={doc.solicitante.linha} nome={doc.solicitante.nome} em={doc.solicitante.em} qrUrl={doc.solicitante.em ? verifUrl("solicitante") : ""} />
          </div>
          <div style={{ flex: 1 }}>
            <Assinado titulo="SOLICITADO" linha={doc.solicitado?.linha || doc.solicitadoNome} nome={doc.solicitado?.nome || ""} em={doc.solicitado?.em || null} qrUrl={doc.solicitado?.em ? verifUrl("solicitado") : ""} />
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
            {doc.p1Nome && (
              <div style={{ marginTop: 8, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {verifUrl("p1") ? <QrCode url={verifUrl("p1")} size={48} /> : null}
                <span style={{ fontSize: "8.5pt" }}>{doc.p1Cargo ? `${doc.p1Cargo} ` : ""}{doc.p1Nome} · {dataHora(doc.p1Em)}</span>
              </div>
            )}
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
            {doc.visto && verifUrl("subcmt") ? (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <QrCode url={verifUrl("subcmt")} size={48} />
                <span style={{ fontSize: "8pt", color: "#555" }}>{doc.visto === "autorizado" ? "Autorizado" : "Não autorizado"} — verifique no QR</span>
              </div>
            ) : null}
          </div>
        </div>

        {doc.protocolo && doc.verifToken ? (
          <p style={{ marginTop: 10, fontSize: "8pt", color: "#555", textAlign: "center" }}>
            Autenticidade: aponte a câmera em qualquer QR ou acesse {base.replace(/^https?:\/\//, "")}/verificar/permuta/{doc.protocolo} — o sistema recalcula o lacre e confirma se o documento é autêntico e não foi alterado.
          </p>
        ) : null}

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
