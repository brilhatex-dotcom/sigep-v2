"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Info, FileText } from "lucide-react";
import { imprimirElemento } from "@/lib/imprimir";

/* Três documentos que fecham a parte DOCUMENTAL da LGPD, além do Aviso de
   Privacidade: Política de Retenção/Descarte, Designação do Encarregado (DPO)
   e o ROPA (Registro das Operações de Tratamento). Editáveis e imprimíveis. */

const ANO = new Date().getFullYear();

function Cabecalho() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "4mm" }} contentEditable={false}>
        <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "24mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
          <img src="/brasoes/armas-ma.png" alt="" style={{ height: "15mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>ESTADO DO MARANHÃO</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>POLÍCIA MILITAR DO MARANHÃO</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: "11pt" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
        </div>
        <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
      </div>
    </>
  );
}

function DocModal({ id, titulo, subtitulo, children, onFechar }: { id: string; titulo: string; subtitulo: string; children: React.ReactNode; onFechar: () => void }) {
  return createPortal((
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-end gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]"><Info className="h-3.5 w-3.5" /> Clique no documento para editar (nomes, datas) antes de imprimir.</span>
        <button onClick={() => imprimirElemento(document.getElementById(id), { titulo })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Baixar PDF</button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
      </div>
      <div id={id} contentEditable suppressContentEditableWarning spellCheck={false}
        className="mx-auto my-6 bg-white text-black shadow-2xl outline-none print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm 22mm", fontFamily: "Times New Roman, Times, serif", fontSize: "11.5pt", lineHeight: 1.5, position: "relative" }}>
        <Cabecalho />
        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "9mm 0 1mm" }}>{titulo}</h1>
        <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 7mm" }}>{subtitulo}</p>
        {children}
        <p style={{ marginTop: "12mm", textAlign: "center" }}>Presidente Dutra - MA, ______ de __________________ de {ANO}.</p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: "16mm", textAlign: "center" }} contentEditable={false}>
          <div style={{ width: "90mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm", fontWeight: "bold" }}>Comandante do 18º BPM</div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

const th: React.CSSProperties = { border: "1px solid #000", padding: "2mm 3mm", background: "#eee", fontWeight: "bold", textAlign: "left", verticalAlign: "top" };
const td: React.CSSProperties = { border: "1px solid #000", padding: "2mm 3mm", verticalAlign: "top" };

export default function DocumentosLgpd() {
  const [montado, setMontado] = useState(false);
  const [aberto, setAberto] = useState<null | "ret" | "dpo" | "ropa">(null);
  useEffect(() => { setMontado(true); }, []);

  const Btn = ({ k, label }: { k: "ret" | "dpo" | "ropa"; label: string }) => (
    <button onClick={() => setAberto(k)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
      <FileText className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Btn k="ret" label="Política de Retenção e Descarte" />
        <Btn k="dpo" label="Designação do Encarregado (DPO)" />
        <Btn k="ropa" label="Registro de Tratamento (ROPA)" />
      </div>

      {montado && aberto === "ret" && (
        <DocModal id="lgpd-ret" titulo="POLÍTICA DE RETENÇÃO E DESCARTE DE DADOS" subtitulo="Sistema SIGEP-18º BPM — Lei nº 13.709/2018 (LGPD)" onFechar={() => setAberto(null)}>
          <p style={{ textAlign: "justify" }}><b>1. Objetivo.</b> Estabelecer por quanto tempo os dados pessoais tratados no SIGEP são mantidos e como são descartados, atendendo aos princípios da necessidade e da limitação (art. 6º, III e art. 15 da LGPD).</p>
          <p style={{ textAlign: "justify" }}><b>2. Critério geral.</b> Os dados são mantidos enquanto durar a finalidade (gestão de pessoal do 18º BPM) e o vínculo funcional do militar, e depois pelo prazo legal de guarda de documentos administrativos e militares.</p>
          <p style={{ textAlign: "justify" }}><b>3. Prazos por categoria (referência — ajustar à norma vigente):</b></p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt", margin: "2mm 0" }}>
            <tbody>
              <tr><td style={th}>Categoria</td><td style={th}>Retenção</td></tr>
              <tr><td style={td}>Cadastro funcional (efetivo)</td><td style={td}>Enquanto durar o vínculo + prazo de guarda funcional</td></tr>
              <tr><td style={td}>Escalas, férias, licença-prêmio, permutas</td><td style={td}>5 anos após o exercício a que se referem</td></tr>
              <tr><td style={td}>Procedimentos disciplinares (FATD/sindicância/IPS)</td><td style={td}>Conforme a legislação disciplinar militar</td></tr>
              <tr><td style={td}>Logs de auditoria / acesso</td><td style={td}>Mínimo de 6 meses (Marco Civil); mantidos p/ segurança</td></tr>
              <tr><td style={td}>Assinaturas eletrônicas e lacres</td><td style={td}>Mesmo prazo do documento assinado</td></tr>
            </tbody>
          </table>
          <p style={{ textAlign: "justify" }}><b>4. Descarte.</b> Encerrado o prazo, os dados são eliminados de forma segura (exclusão do banco e das cópias de backup na rotação seguinte), salvo obrigação legal de guarda, exercício regular de direitos ou interesse público (art. 16 da LGPD).</p>
          <p style={{ textAlign: "justify" }}><b>5. Backup.</b> As cópias de segurança seguem os mesmos prazos; backups vencidos são sobrescritos/eliminados na rotação.</p>
          <p style={{ textAlign: "justify" }}><b>6. Revisão.</b> Esta política é revista anualmente pelo Comando, com apoio do Encarregado (DPO).</p>
        </DocModal>
      )}

      {montado && aberto === "dpo" && (
        <DocModal id="lgpd-dpo" titulo="DESIGNAÇÃO DO ENCARREGADO PELO TRATAMENTO DE DADOS (DPO)" subtitulo="Sistema SIGEP-18º BPM — art. 5º, VIII e art. 41 da Lei nº 13.709/2018" onFechar={() => setAberto(null)}>
          <p style={{ textAlign: "justify" }}>O Comandante do 18º Batalhão de Polícia Militar, no uso de suas atribuições, e considerando o art. 41 da Lei nº 13.709/2018 (LGPD), <b>DESIGNA</b> como <b>Encarregado pelo Tratamento de Dados Pessoais (DPO)</b> no âmbito do sistema SIGEP:</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt", margin: "3mm 0" }}>
            <tbody>
              <tr><td style={th}>Nome / Posto</td><td style={td}>______________________________________________</td></tr>
              <tr><td style={th}>Função</td><td style={td}>Encarregado pelo Tratamento de Dados (DPO) — 18º BPM</td></tr>
              <tr><td style={th}>Contato (e-mail)</td><td style={td}>18batalhaopmma@gmail.com</td></tr>
            </tbody>
          </table>
          <p style={{ textAlign: "justify" }}><b>Atribuições do Encarregado:</b></p>
          <p style={{ textAlign: "justify", margin: "0 0 1mm" }}>a) aceitar reclamações e comunicações dos titulares, prestar esclarecimentos e adotar providências;</p>
          <p style={{ textAlign: "justify", margin: "0 0 1mm" }}>b) receber comunicações da autoridade nacional (ANPD) e adotar providências;</p>
          <p style={{ textAlign: "justify", margin: "0 0 1mm" }}>c) orientar os servidores/militares quanto às práticas de proteção de dados;</p>
          <p style={{ textAlign: "justify", margin: "0 0 1mm" }}>d) executar as demais atribuições do art. 41, §2º da LGPD.</p>
          <p style={{ textAlign: "justify" }}>A identidade e o contato do Encarregado são divulgados no Aviso de Privacidade do sistema.</p>
        </DocModal>
      )}

      {montado && aberto === "ropa" && (
        <DocModal id="lgpd-ropa" titulo="REGISTRO DAS OPERAÇÕES DE TRATAMENTO DE DADOS (ROPA)" subtitulo="Sistema SIGEP-18º BPM — art. 37 da Lei nº 13.709/2018" onFechar={() => setAberto(null)}>
          <p style={{ textAlign: "justify" }}>Registro das atividades de tratamento de dados pessoais realizadas pelo controlador (18º BPM) no sistema SIGEP.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt", margin: "2mm 0" }}>
            <tbody>
              <tr>
                <td style={th}>Operação</td><td style={th}>Finalidade</td><td style={th}>Base legal</td><td style={th}>Dados</td><td style={th}>Retenção</td>
              </tr>
              {[
                ["Cadastro do efetivo", "Gestão de pessoal", "Cumprimento de obrigação legal / interesse público (art. 7º, II/III e art. 23)", "Identificação, funcional, contato, CPF", "Vínculo + guarda"],
                ["Escalas de serviço", "Organização do serviço", "Execução de política pública (art. 23)", "Nome, posto, lotação, datas", "5 anos"],
                ["Férias / Licença-Prêmio", "Gestão de afastamentos", "Obrigação legal (art. 23)", "Nome, período, exercício", "5 anos"],
                ["Permutas", "Troca de serviço", "Interesse público (art. 23)", "Nome, datas, parecer", "5 anos"],
                ["Disciplinar (FATD/IPS)", "Apuração disciplinar", "Obrigação legal / exercício regular de direitos", "Identificação, fatos", "Legislação disciplinar"],
                ["Auditoria / acessos", "Segurança da informação", "Legítimo interesse / segurança (Marco Civil)", "Login, IP, dispositivo, GPS em falhas", "≥ 6 meses"],
              ].map((l, i) => (
                <tr key={i}><td style={td}>{l[0]}</td><td style={td}>{l[1]}</td><td style={td}>{l[2]}</td><td style={td}>{l[3]}</td><td style={td}>{l[4]}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ textAlign: "justify", fontSize: "10.5pt" }}><b>Controlador:</b> 18º Batalhão de Polícia Militar do Maranhão. <b>Compartilhamento:</b> apenas quando exigido por lei ou por autoridade competente. <b>Segurança:</b> senhas em bcrypt, CPF/dados bancários criptografados, controle de acesso por função, auditoria lacrada por hash e assinatura eletrônica avançada.</p>
        </DocModal>
      )}
    </>
  );
}
