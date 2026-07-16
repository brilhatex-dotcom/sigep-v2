"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Info, FileText } from "lucide-react";

/* Portaria Interna que autoriza o uso do SIGEP como ferramenta de apoio
   administrativo. Documento editável e imprimível (PDF pelo print). */

const ANO = new Date().getFullYear();

export default function PortariaSistemaDoc() {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [comandante, setComandante] = useState("");
  useEffect(() => { setMontado(true); }, []);
  useEffect(() => {
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.comandante) setComandante(d.comandante); }).catch(() => {});
  }, []);

  return (
    <>
      <button onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
        <FileText className="h-4 w-4" /> Portaria de uso do sistema
      </button>

      {aberto && montado && createPortal((
        <div id="ports-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
          <div className="no-print sticky top-0 z-10 flex items-center justify-end gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
            <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]"><Info className="h-3.5 w-3.5" /> Clique no documento para editar antes de imprimir.</span>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Baixar PDF</button>
            <button onClick={() => setAberto(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
          </div>

          <div id="ports-print" contentEditable suppressContentEditableWarning spellCheck={false}
            className="mx-auto my-6 bg-white text-black shadow-2xl outline-none print:my-0 print:shadow-none"
            style={{ width: "210mm", minHeight: "297mm", padding: "16mm 22mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.6, position: "relative" }}>

            <div style={{ display: "flex", alignItems: "center", gap: "4mm" }} contentEditable={false}>
              <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "26mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
              <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
                <img src="/brasoes/armas-ma.png" alt="" style={{ height: "16mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
                <p style={{ margin: 0, fontWeight: "bold" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
                <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
                <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
                <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
              </div>
              <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            </div>
            <p style={{ textAlign: "center", fontSize: "8.5pt", margin: "1mm 0 0", lineHeight: 1.2 }} contentEditable={false}>
              Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />TELEFONE: (99) 98509-5005 (Permanência) — 18batalhaopmma@gmail.com
            </p>

            <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "10mm 0 1mm" }}>PORTARIA INTERNA Nº ______/{ANO} - 18º BPM</h1>
            <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 8mm" }}>Sistema de Apoio Administrativo — SIGEP</p>

            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
              O <strong>Comandante do 18º Batalhão de Polícia Militar</strong>, no uso das atribuições legais que lhe são conferidas,
            </p>
            <p style={{ fontWeight: "bold", margin: "0 0 5mm" }}>RESOLVE:</p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>Art. 1º</strong> — Fica autorizado o uso experimental do Sistema <strong>SIGEP</strong> no âmbito da Seção P/1 do 18º BPM como ferramenta de apoio administrativo.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>Art. 2º</strong> — O Sistema SIGEP-18º BPM será utilizado como ferramenta auxiliar de gestão de efetivo, controle administrativo e apoio à elaboração de documentos, permanecendo válidos os procedimentos administrativos previstos nas normas da Corporação.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>Art. 3º</strong> — Os atos praticados no sistema são registrados em trilha de auditoria (usuário, data, hora, IP e dispositivo), com assinatura eletrônica por login individual e histórico protegido, para fins de controle e responsabilização.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 6mm" }}>
              <strong>Art. 4º</strong> — Esta Portaria entra em vigor na data de sua publicação.
            </p>
            <p style={{ margin: "0 0 12mm" }}>PUBLIQUE-SE, REGISTRE-SE E CUMPRA-SE.</p>
            <p style={{ textAlign: "center", margin: "0 0 16mm" }} contentEditable={false}>Quartel do 18º BPM, em Presidente Dutra - MA, ______ de ____________________ de {ANO}.</p>
            <div style={{ display: "flex", justifyContent: "center" }} contentEditable={false}>
              <div style={{ textAlign: "center", width: "110mm" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>{comandante || "________________________"}</div>
                <div>Comandante do 18º BPM</div>
              </div>
            </div>
          </div>

          <style>{`@media print { body > *:not(#ports-overlay){display:none!important;} #ports-overlay{position:static!important;overflow:visible!important;background:#fff!important;inset:auto!important;display:block!important;} #ports-print{position:static!important;margin:0 auto!important;box-shadow:none!important;min-height:0!important;width:100%!important;padding:14mm 18mm!important;} html,body{margin:0!important;padding:0!important;background:#fff!important;} @page{size:A4;margin:0;} }`}</style>
        </div>
      ), document.body)}
    </>
  );
}
