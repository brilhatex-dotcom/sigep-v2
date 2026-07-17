"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Info, ShieldCheck } from "lucide-react";

/* Aviso de Privacidade / Política de Proteção de Dados (LGPD).
   Documento editável e imprimível — cobre o lado DOCUMENTAL da LGPD:
   dados coletados, finalidade, base legal, retenção/descarte, direitos do
   titular e encarregado (DPO). É o item que faltava para a conformidade. */

const ANO = new Date().getFullYear();

export default function AvisoPrivacidadeDoc() {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  return (
    <>
      <button onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
        <ShieldCheck className="h-4 w-4" /> Aviso de Privacidade (LGPD)
      </button>

      {aberto && montado && createPortal((
        <div id="lgpd-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
          <div className="no-print sticky top-0 z-10 flex items-center justify-end gap-2 bg-[#0b1626] px-3 py-2 shadow print:hidden">
            <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#8fa3bf]"><Info className="h-3.5 w-3.5" /> Clique no documento para editar antes de imprimir.</span>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Baixar PDF</button>
            <button onClick={() => setAberto(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
          </div>

          <div id="lgpd-print" contentEditable suppressContentEditableWarning spellCheck={false}
            className="mx-auto my-6 bg-white text-black shadow-2xl outline-none print:my-0 print:shadow-none"
            style={{ width: "210mm", minHeight: "297mm", padding: "16mm 22mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.55, position: "relative" }}>

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
              Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000
            </p>

            <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "10mm 0 1mm" }}>AVISO DE PRIVACIDADE E PROTEÇÃO DE DADOS</h1>
            <p style={{ textAlign: "center", fontWeight: "bold", margin: "0 0 8mm" }}>Sistema SIGEP-18º BPM — Lei nº 13.709/2018 (LGPD)</p>

            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>1. Finalidade.</strong> O SIGEP é um sistema interno de apoio à gestão de pessoal (P/1) do 18º BPM. Os dados dos policiais são tratados exclusivamente para fins administrativos: controle de efetivo, escalas de serviço, férias, licenças, permutas, procedimentos disciplinares e emissão de documentos oficiais.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>2. Dados tratados.</strong> Dados de identificação e funcionais (nome, posto/graduação, matrícula, ID PMMA, número/barra, lotação, situação), contato, e — quando necessário — CPF e dados bancários. O CPF e os dados bancários são armazenados de forma <strong>criptografada</strong>.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>3. Base legal.</strong> O tratamento apoia-se no <strong>cumprimento de obrigação legal e regulamentar</strong> e na <strong>execução de políticas públicas / exercício regular de competências da Administração Pública</strong> (art. 7º, II e III, e art. 23 da LGPD), no âmbito da atividade-fim da Polícia Militar.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>4. Acesso e controle.</strong> Cada policial acessa apenas os próprios dados; funções administrativas são restritas por encargo (Comandante, Subcomandante, Chefe e Auxiliares do P/1). Todos os acessos e alterações relevantes são registrados em trilha de auditoria (usuário, data, hora, IP e dispositivo), protegida por lacre eletrônico.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>5. Segurança.</strong> São adotadas medidas técnicas de proteção: senhas com criptografia (bcrypt), criptografia de dados sensíveis em repouso, expiração de sessão por inatividade, cabeçalhos de segurança, reautenticação em atos sensíveis e backup externo periódico.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>6. Retenção e descarte.</strong> Os dados são mantidos enquanto durar o vínculo funcional do militar com a unidade e pelos prazos exigidos pela legislação de arquivos públicos e pelas normas da Corporação. Encerrado o prazo, os dados são anonimizados ou eliminados de forma segura, ressalvada a guarda de documentos de valor histórico ou probatório.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>7. Direitos do titular.</strong> O policial pode solicitar confirmação do tratamento, acesso, correção de dados incompletos ou desatualizados e informações sobre o uso, nos termos do art. 18 da LGPD, mediante requerimento à Seção P/1.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 4mm" }}>
              <strong>8. Compartilhamento.</strong> Os dados não são compartilhados com terceiros externos, salvo por determinação legal, judicial ou por exigência do Comando-Geral da Corporação.
            </p>
            <p style={{ textAlign: "justify", margin: "0 0 8mm" }}>
              <strong>9. Encarregado (DPO).</strong> O encarregado pelo tratamento de dados no âmbito do 18º BPM será oportunamente designado pelo Comando da Unidade. Contato: <u>18batalhaopmma@gmail.com</u>.
            </p>

            <p style={{ textAlign: "center", margin: "12mm 0 0" }} contentEditable={false}>Presidente Dutra - MA, ______ de ____________________ de {ANO}.</p>
          </div>

          <style>{`@media print { body > *:not(#lgpd-overlay){display:none!important;} #lgpd-overlay{position:static!important;overflow:visible!important;background:#fff!important;inset:auto!important;display:block!important;} #lgpd-print{position:static!important;margin:0 auto!important;box-shadow:none!important;min-height:0!important;width:100%!important;padding:14mm 18mm!important;} html,body{margin:0!important;padding:0!important;background:#fff!important;} @page{size:A4;margin:0;} }`}</style>
        </div>
      ), document.body)}
    </>
  );
}
