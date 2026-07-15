"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown, Loader2, Info } from "lucide-react";

/* =========================================================================
   PortariaDoc — Portaria de Instauração de procedimento apuratório
   (Sindicância / IPS / IPM). Primeira peça do procedimento: a autoridade
   designa o encarregado, define o objeto e o prazo. Editável na tela; PDF pelo
   print; Word por /api/disciplinar/portaria-docx. Wording muda por tipo.
   ========================================================================= */

export type PortariaRegistro = {
  id: string; tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
};

export const PORTARIA_INFO: Record<string, { titulo: string; instaurar: string; enc: string; base: string; prazoPadrao: string }> = {
  sindicancia: {
    titulo: "SINDICÂNCIA",
    instaurar: "Sindicância",
    enc: "Encarregado(a) da Sindicância",
    base: "no Regulamento Disciplinar da PMMA e na Lei de Organização Básica da Corporação",
    prazoPadrao: "30 (trinta)",
  },
  ips: {
    titulo: "INVESTIGAÇÃO PRELIMINAR SUMÁRIA — IPS",
    instaurar: "Investigação Preliminar Sumária (IPS)",
    enc: "Encarregado(a) da IPS",
    base: "nas normas administrativas disciplinares em vigor na Corporação",
    prazoPadrao: "15 (quinze)",
  },
  ipm: {
    titulo: "INQUÉRITO POLICIAL MILITAR — IPM",
    instaurar: "Inquérito Policial Militar (IPM)",
    enc: "Encarregado(a) do IPM",
    base: "no Código de Processo Penal Militar (art. 9º e seguintes)",
    prazoPadrao: "40 (quarenta)",
  },
};

const ANO = new Date().getFullYear();
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function ul(w: string): React.CSSProperties {
  return { display: "inline-block", minWidth: w, borderBottom: "1px solid #000" };
}

export default function PortariaDoc({ reg, onFechar }: { reg: PortariaRegistro; onFechar: () => void }) {
  const [montado, setMontado] = useState(false);
  const [baixandoWord, setBaixandoWord] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado || typeof document === "undefined") return null;

  const info = PORTARIA_INFO[reg.tipo] || PORTARIA_INFO.sindicancia;
  // Nº da portaria: usa o campo "portaria" (limpo do prefixo) ou cai no número do procedimento.
  const numPortaria = (reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || (reg.numero || "").trim() || `______/${ANO}`;

  async function baixarWord() {
    setBaixandoWord(true);
    try {
      const res = await fetch(`/api/disciplinar/portaria-docx?id=${encodeURIComponent(reg.id)}`);
      if (!res.ok) { alert("Não foi possível gerar o Word."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Portaria_${info.titulo.split(" ")[0]}_${numPortaria.replace(/[^\w]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Erro de conexão ao gerar o Word."); }
    finally { setBaixandoWord(false); }
  }

  const conteudo = (
    <div id="port-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]">
          <Info className="h-3.5 w-3.5" /> Clique no documento para ajustar qualquer texto antes de imprimir.
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
        id="port-print"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="mx-auto my-6 bg-white text-black shadow-2xl outline-none print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 20mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.5, position: "relative" }}
      >
        {/* Cabeçalho oficial */}
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
          Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />
          TELEFAX: (99) 98497-1918 (Permanência) — 18batalhaopmma@gmail.com
        </p>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 1mm" }}>
          PORTARIA Nº {numPortaria}
        </h1>
        <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 8mm" }}>
          Instauração de {info.titulo}
        </p>

        <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 6mm" }}>
          O <strong>Comandante do 18º Batalhão de Polícia Militar</strong>, no uso das atribuições legais que lhe
          são conferidas e com fundamento {info.base}, e <strong>considerando</strong> os fatos que ensejam
          apuração no âmbito desta Unidade,
        </p>

        <p style={{ fontWeight: "bold", margin: "0 0 5mm" }}>RESOLVE:</p>

        <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
          <strong>Art. 1º</strong> — Instaurar <strong>{info.instaurar}</strong> destinada a apurar{" "}
          {reg.objeto?.trim() ? reg.objeto : <span style={ul("120mm")}>&nbsp;</span>}
          {reg.envolvido?.trim() ? <>, tendo como envolvido(a) <strong>{reg.envolvido}</strong></> : null}.
        </p>
        <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
          <strong>Art. 2º</strong> — Designar {reg.encarregado?.trim() ? <strong>{reg.encarregado}</strong> : <span style={ul("80mm")}>&nbsp;</span>}{" "}
          para, na condição de <strong>{info.enc}</strong>, presidir e conduzir os respectivos trabalhos, ficando
          autorizado a praticar todos os atos necessários à elucidação dos fatos.
        </p>
        <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
          <strong>Art. 3º</strong> — Fixar o prazo de <strong>{info.prazoPadrao}</strong> dias para a conclusão dos
          trabalhos, a contar do recebimento desta Portaria, admitida prorrogação na forma regulamentar
          {reg.prazo?.trim() ? <> (previsão de conclusão em <strong>{dBR(reg.prazo)}</strong>)</> : null}.
        </p>
        <p style={{ textAlign: "justify", margin: "0 0 6mm" }}>
          <strong>Art. 4º</strong> — Esta Portaria entra em vigor na data de sua publicação.
        </p>

        <p style={{ margin: "0 0 10mm" }}>Publique-se, registre-se e cumpra-se.</p>

        <p style={{ textAlign: "center", margin: "0 0 16mm" }} contentEditable={false}>
          Presidente Dutra-MA, {reg.dataInstauracao?.trim() ? dBR(reg.dataInstauracao) : "______ de ____________________ de " + ANO}.
        </p>

        <div style={{ display: "flex", justifyContent: "center" }} contentEditable={false}>
          <div style={{ textAlign: "center", width: "95mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>Autoridade instauradora</div>
            <div>Comandante do 18º BPM</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#port-overlay) { display: none !important; }
          #port-overlay { position: static !important; overflow: visible !important; background: #fff !important; inset: auto !important; display: block !important; }
          #port-print { position: static !important; margin: 0 auto !important; box-shadow: none !important; min-height: 0 !important; width: 100% !important; padding: 14mm 18mm !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(conteudo, document.body);
}
