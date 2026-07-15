"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileDown, Loader2, Info } from "lucide-react";

/* =========================================================================
   TermoDoc — termos do procedimento apuratório (Sindicância/IPS/IPM):
     - autuacao   : Termo de Autuação (abre os autos)
     - declaracoes: Termo de Declarações (oitiva de testemunha/declarante/acusado)
     - relatorio  : Relatório Final / Conclusão do encarregado
   Peça editável na tela; PDF pelo print; Word por /api/disciplinar/termo-docx.
   ========================================================================= */

export type TermoModelo = "autuacao" | "juntada" | "notificacao" | "declaracoes" | "relatorio" | "solucao";
export type TermoRegistro = {
  id: string; tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
};

export const TERMO_LABEL: Record<TermoModelo, string> = {
  autuacao: "Termo de Autuação",
  juntada: "Termo de Juntada",
  notificacao: "Notificação / Intimação",
  declaracoes: "Termo de Declarações",
  relatorio: "Relatório Final",
  solucao: "Despacho / Solução",
};

const NOME_PROC: Record<string, string> = {
  sindicancia: "Sindicância", ips: "Investigação Preliminar Sumária (IPS)", ipm: "Inquérito Policial Militar (IPM)",
};

const ANO = new Date().getFullYear();
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function ul(w: string): React.CSSProperties {
  return { display: "inline-block", minWidth: w, borderBottom: "1px solid #000" };
}
function Linhas({ n }: { n: number }) {
  return <>{Array.from({ length: n }).map((_, i) => <div key={i} style={{ borderBottom: "1px solid #000", height: "7mm" }} />)}</>;
}
function Assina({ papel }: { papel: string }) {
  return (
    <div style={{ textAlign: "center", width: "80mm", margin: "0 auto" }}>
      <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>{papel}</div>
    </div>
  );
}

export default function TermoDoc({ reg, modelo, onFechar }: { reg: TermoRegistro; modelo: TermoModelo; onFechar: () => void }) {
  const [montado, setMontado] = useState(false);
  const [baixandoWord, setBaixandoWord] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado || typeof document === "undefined") return null;

  const proc = NOME_PROC[reg.tipo] || "procedimento apuratório";
  const numRef = (reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || (reg.numero || "").trim() || `______/${ANO}`;
  const dataExt = "Aos ______ dias do mês de ____________________ do ano de " + ANO + ", nesta cidade de São Luís, Estado do Maranhão, na sede do 18º Batalhão de Polícia Militar,";

  async function baixarWord() {
    setBaixandoWord(true);
    try {
      const res = await fetch(`/api/disciplinar/termo-docx?id=${encodeURIComponent(reg.id)}&modelo=${modelo}`);
      if (!res.ok) { alert("Não foi possível gerar o Word."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${TERMO_LABEL[modelo].replace(/\s+/g, "_")}_${numRef.replace(/[^\w]+/g, "_")}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Erro de conexão ao gerar o Word."); }
    finally { setBaixandoWord(false); }
  }

  const conteudo = (
    <div id="termo-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]">
          <Info className="h-3.5 w-3.5" /> {TERMO_LABEL[modelo]} — clique no documento para ajustar qualquer texto antes de imprimir.
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
        id="termo-print"
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
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA DO INTERIOR 2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
          </div>
          <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>

        <p style={{ textAlign: "center", fontSize: "10pt", margin: "6mm 0 1mm" }}>
          {proc} · Portaria nº {numRef}{reg.objeto?.trim() ? ` — apuração de: ${reg.objeto}` : ""}
        </p>

        {/* ---- corpo por modelo ---- */}
        {modelo === "autuacao" && (
          <>
            <h1 style={sTit}>TERMO DE AUTUAÇÃO</h1>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 6mm" }}>
              {dataExt} eu, {reg.encarregado?.trim() ? <strong>{reg.encarregado}</strong> : <span style={ul("70mm")}>&nbsp;</span>},
              Encarregado(a) designado(a) pela Portaria nº <strong>{numRef}</strong>, <strong>AUTUO</strong> a referida
              Portaria e os documentos que a acompanham, dando início aos autos do presente procedimento.
              Do que, para constar, lavrei o presente termo, que vai por mim assinado.
            </p>
            <div style={{ marginTop: "26mm" }} contentEditable={false}>
              <Assina papel="Encarregado(a) do procedimento" />
            </div>
          </>
        )}

        {modelo === "juntada" && (
          <>
            <h1 style={sTit}>TERMO DE JUNTADA</h1>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 4mm" }}>
              {dataExt} eu, {reg.encarregado?.trim() ? <strong>{reg.encarregado}</strong> : <span style={ul("60mm")}>&nbsp;</span>},
              Encarregado(a) do procedimento em epígrafe, procedo à <strong>JUNTADA</strong> aos presentes autos do(s)
              seguinte(s) documento(s):
            </p>
            <Linhas n={8} />
            <p style={{ textAlign: "justify", margin: "4mm 0 0" }}>
              Do que, para constar, lavrei o presente termo, que vai por mim assinado.
            </p>
            <div style={{ marginTop: "22mm" }} contentEditable={false}>
              <Assina papel="Encarregado(a) do procedimento" />
            </div>
          </>
        )}

        {modelo === "notificacao" && (
          <>
            <h1 style={sTit}>NOTIFICAÇÃO / INTIMAÇÃO</h1>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
              Pelo presente, fica <strong>{reg.envolvido?.trim() || <span style={ul("80mm")}>&nbsp;</span>}</strong>{" "}
              <strong>NOTIFICADO(A)</strong> a comparecer perante o(a) Encarregado(a) do(a) {proc}, instaurado(a) pela
              Portaria nº <strong>{numRef}</strong>, no dia <span style={ul("28mm")}>&nbsp;</span> às{" "}
              <span style={ul("16mm")}>&nbsp;</span> horas, na sede do 18º Batalhão de Polícia Militar, a fim de:
            </p>
            <p style={{ margin: "0 0 4mm" }}>
              [ &nbsp; ] ser ouvido(a) &nbsp;&nbsp; [ &nbsp; ] apresentar defesa &nbsp;&nbsp;
              [ &nbsp; ] acompanhar os trabalhos &nbsp;&nbsp; [ &nbsp; ] tomar ciência
            </p>
            <p style={{ margin: "0 0 5mm" }}>
              na condição de <span style={ul("70mm")}>&nbsp;</span>.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 5mm" }}>
              Fica o(a) notificado(a) ciente de que lhe são assegurados o contraditório e a ampla defesa, podendo
              fazer-se acompanhar de advogado e indicar testemunhas, na forma da lei.
            </p>
            <p style={{ textAlign: "center", margin: "6mm 0 12mm" }} contentEditable={false}>
              São Luís/MA, ______ de ____________________ de {ANO}.
            </p>
            <div style={{ marginBottom: "10mm" }} contentEditable={false}>
              <Assina papel="Encarregado(a) do procedimento" />
            </div>
            <div style={{ borderTop: "1px dashed #000", paddingTop: "3mm", fontSize: "10.5pt" }}>
              <p style={{ fontWeight: "bold", margin: "0 0 2mm" }}>CIÊNCIA DO(A) NOTIFICADO(A)</p>
              <p style={{ margin: 0 }}>
                Recebi a presente notificação em <span style={ul("30mm")}>&nbsp;</span>, ciente do dia e hora acima.
              </p>
              <div style={{ marginTop: "16mm" }} contentEditable={false}>
                <Assina papel="Assinatura do(a) notificado(a)" />
              </div>
            </div>
          </>
        )}

        {modelo === "declaracoes" && (
          <>
            <h1 style={sTit}>TERMO DE DECLARAÇÕES</h1>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 4mm" }}>
              {dataExt} perante mim, {reg.encarregado?.trim() ? <strong>{reg.encarregado}</strong> : <span style={ul("60mm")}>&nbsp;</span>},
              Encarregado(a) do procedimento em epígrafe, presente o(a) declarante abaixo qualificado(a), que aos
              costumes disse nada e, inquirido(a) sobre os fatos objeto de apuração, RESPONDEU:
            </p>
            <div style={{ border: "1px solid #000", padding: "2mm 3mm", margin: "0 0 4mm", fontSize: "11pt" }}>
              <p style={{ margin: "0 0 1mm" }}><strong>Qualificação:</strong></p>
              <p style={{ margin: "0 0 1mm" }}>Nome: <span style={ul("95mm")}>&nbsp;</span> Posto/Grad: <span style={ul("35mm")}>&nbsp;</span></p>
              <p style={{ margin: "0 0 1mm" }}>Matrícula: <span style={ul("40mm")}>&nbsp;</span> Lotação: <span style={ul("70mm")}>&nbsp;</span></p>
              <p style={{ margin: 0 }}>Condição: [ &nbsp; ] Testemunha &nbsp; [ &nbsp; ] Declarante &nbsp; [ &nbsp; ] Acusado(a) &nbsp; [ &nbsp; ] Vítima</p>
            </div>
            <p style={{ margin: "0 0 1mm" }}><strong>ÀS PERGUNTAS RESPONDEU QUE:</strong></p>
            <Linhas n={11} />
            <p style={{ textAlign: "justify", margin: "4mm 0 0" }}>
              Nada mais havendo, encerra-se o presente termo que, lido e achado conforme, vai devidamente assinado.
            </p>
            <div style={{ marginTop: "18mm", display: "flex", gap: "10mm" }} contentEditable={false}>
              <div style={{ flex: 1 }}><Assina papel="Declarante" /></div>
              <div style={{ flex: 1 }}><Assina papel="Encarregado(a)" /></div>
            </div>
          </>
        )}

        {modelo === "relatorio" && (
          <>
            <h1 style={sTit}>RELATÓRIO FINAL</h1>
            <p style={{ margin: "0 0 4mm" }}>Senhor Comandante,</p>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
              Em cumprimento à Portaria nº <strong>{numRef}</strong>, que instaurou {proc}
              {reg.dataInstauracao?.trim() ? <> em <strong>{dBR(reg.dataInstauracao)}</strong></> : null} para apurar{" "}
              {reg.objeto?.trim() ? <strong>{reg.objeto}</strong> : <span style={ul("90mm")}>&nbsp;</span>}, venho, na condição
              de Encarregado(a), apresentar o relatório dos trabalhos realizados.
            </p>
            <p style={sSub}>I — DOS FATOS</p><Linhas n={4} />
            <p style={sSub}>II — DAS DILIGÊNCIAS REALIZADAS</p><Linhas n={4} />
            <p style={sSub}>III — DA ANÁLISE</p><Linhas n={4} />
            <p style={sSub}>IV — DA CONCLUSÃO</p><Linhas n={3} />
            <p style={{ textAlign: "justify", margin: "4mm 0 0" }}>
              É o relatório, que submeto à apreciação e deliberação de Vossa Senhoria.
            </p>
            <p style={{ textAlign: "center", margin: "10mm 0 16mm" }} contentEditable={false}>
              São Luís/MA, ______ de ____________________ de {ANO}.
            </p>
            <div contentEditable={false}>
              <div style={{ textAlign: "center", width: "90mm", margin: "0 auto" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>
                  {reg.encarregado?.trim() || "Encarregado(a) do procedimento"}
                </div>
                <div>Encarregado(a) do procedimento</div>
              </div>
            </div>
          </>
        )}

        {modelo === "solucao" && (
          <>
            <h1 style={sTit}>DESPACHO / SOLUÇÃO</h1>
            <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 5mm" }}>
              Vistos e examinados os presentes autos de {proc} nº <strong>{numRef}</strong>, instaurado(a) para apurar{" "}
              {reg.objeto?.trim() ? <strong>{reg.objeto}</strong> : <span style={ul("90mm")}>&nbsp;</span>}, e
              considerando o relatório final apresentado pelo(a) Encarregado(a),
            </p>
            <p style={{ fontWeight: "bold", margin: "0 0 4mm" }}>DECIDO:</p>
            <p style={{ margin: "0 0 3mm" }}>
              [ &nbsp; ] Acolher o relatório e determinar o <strong>ARQUIVAMENTO</strong> do procedimento, por não
              restar comprovada transgressão/infração.
            </p>
            <p style={{ margin: "0 0 3mm" }}>
              [ &nbsp; ] Acolher o relatório e determinar as seguintes providências (instauração de FATD,
              representação, medidas administrativas):
            </p>
            <Linhas n={3} />
            <p style={{ margin: "3mm 0 3mm" }}>
              [ &nbsp; ] <strong>Não acolher</strong> o relatório, determinando:
            </p>
            <Linhas n={2} />
            <p style={{ margin: "4mm 0 2mm" }}><strong>Fundamentação:</strong></p>
            <Linhas n={3} />
            <p style={{ margin: "6mm 0 10mm" }}>Publique-se, registre-se e cumpra-se.</p>
            <p style={{ textAlign: "center", margin: "0 0 16mm" }} contentEditable={false}>
              São Luís/MA, ______ de ____________________ de {ANO}.
            </p>
            <div contentEditable={false}>
              <div style={{ textAlign: "center", width: "95mm", margin: "0 auto" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>Autoridade competente</div>
                <div>Comandante do 18º BPM</div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          body > *:not(#termo-overlay) { display: none !important; }
          #termo-overlay { position: static !important; overflow: visible !important; background: #fff !important; inset: auto !important; display: block !important; }
          #termo-print { position: static !important; margin: 0 auto !important; box-shadow: none !important; min-height: 0 !important; width: 100% !important; padding: 14mm 18mm !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(conteudo, document.body);
}

const sTit: React.CSSProperties = { textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "5mm 0 6mm", textDecoration: "underline" };
const sSub: React.CSSProperties = { fontWeight: "bold", margin: "4mm 0 1mm" };
