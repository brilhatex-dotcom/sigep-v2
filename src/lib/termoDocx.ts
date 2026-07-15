import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";

/* Termos do procedimento apuratório em .docx: autuacao / declaracoes / relatorio.
   Mesmo cabeçalho e conteúdo da tela, preenchidos pelo registro. */

export type TermoModelo = "autuacao" | "juntada" | "notificacao" | "declaracoes" | "relatorio" | "solucao";
export type TermoReg = {
  tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
};

const NOME_PROC: Record<string, string> = {
  sindicancia: "Sindicância", ips: "Investigação Preliminar Sumária (IPS)", ipm: "Inquérito Policial Militar (IPM)",
};
export const TERMO_LABEL: Record<TermoModelo, string> = {
  autuacao: "Termo de Autuação", juntada: "Termo de Juntada", notificacao: "Notificação-Intimação",
  declaracoes: "Termo de Declarações", relatorio: "Relatório Final", solucao: "Despacho-Solução",
};

const ANO = new Date().getFullYear();
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SOL: Record<string, { titulo: string; agente: string; procNome: string; presente: string; sindicado: string }> = {
  sindicancia: { titulo: "SOLUÇÃO DE SINDICÂNCIA", agente: "sindicante", procNome: "Sindicância", presente: "Solução de Sindicância", sindicado: "Sindicado" },
  ips: { titulo: "SOLUÇÃO DA INVESTIGAÇÃO PRELIMINAR SUMÁRIA", agente: "encarregado", procNome: "Investigação Preliminar Sumária", presente: "Solução da Investigação Preliminar Sumária", sindicado: "envolvido" },
  ipm: { titulo: "SOLUÇÃO DO INQUÉRITO POLICIAL MILITAR", agente: "encarregado", procNome: "Inquérito Policial Militar", presente: "Solução do Inquérito Policial Militar", sindicado: "envolvido" },
};
function pxFromMm(mm: number): number { return Math.round((mm / 25.4) * 96); }
function dBR(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function dataExtenso(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "______ de ____________________ de " + ANO;
  return `${m[3]} de ${MESES[Number(m[2]) - 1] || "____"} de ${m[1]}`;
}
function item(text: string) { return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, indent: { left: 400 }, children: [new TextRun({ text, size: 24 })] }); }
function imagem(nome: string, wMm: number, hMm: number): ImageRun | null {
  try {
    const dados = fs.readFileSync(path.join(process.cwd(), "public", nome));
    const kind: "png" | "jpg" = /\.jpe?g$/i.test(nome) ? "jpg" : "png";
    return new ImageRun({ type: kind, data: dados, transformation: { width: pxFromMm(wMm), height: pxFromMm(hMm) } } as any);
  } catch { return null; }
}
const SEM_BORDA = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
function pCenter(text: string, opt: { bold?: boolean; size?: number; underline?: boolean } = {}) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 24, underline: opt.underline ? {} : undefined })] });
}
function b(text: string) { return new TextRun({ text, bold: true, size: 24 }); }
function t(text: string) { return new TextRun({ text, size: 24 }); }
function just(children: TextRun[], indent = false) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, indent: indent ? { firstLine: 700 } : undefined, children });
}
function sub(text: string) { return new Paragraph({ spacing: { before: 120, after: 60 }, children: [b(text)] }); }
function linha() { return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "_".repeat(95), size: 24 })] }); }
function linhas(n: number) { return Array.from({ length: n }).map(() => linha()); }
function assinatura(papel: string, nome?: string) {
  const out = [new Paragraph({ text: "" }), new Paragraph({ text: "" }), pCenter("__________________________________________", { size: 24 })];
  if (nome && nome.trim()) out.push(pCenter(nome, { bold: true, size: 24 }));
  out.push(pCenter(papel, { size: 24 }));
  return out;
}
const BR = "____________________";

export async function gerarTermoDocx(reg: TermoReg, modelo: TermoModelo, chefes: { comandante?: string } = {}): Promise<Buffer> {
  const comandante = (chefes.comandante || "").trim();
  const proc = NOME_PROC[reg.tipo] || "procedimento apuratório";
  const numRef = (reg.portaria || "").replace(/port(aria)?\.?\s*/i, "").trim() || (reg.numero || "").trim() || `______/${ANO}`;
  const dataExt = `Aos ______ dias do mês de ____________________ do ano de ${ANO}, nesta cidade de Presidente Dutra, Estado do Maranhão, na sede do 18º Batalhão de Polícia Militar,`;

  const imgPmma = imagem("brasoes/pmma-190.jpg", 26, 22);
  const imgMa = imagem("brasoes/armas-ma.png", 16, 16);
  const imgBpm = imagem("brasoes/brasao-18bpm.png", 22, 22);
  const org = [
    "ESTADO DO MARANHÃO", "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
    "POLÍCIA MILITAR DO MARANHÃO", "COMANDO DO POLICIAMENTO DE ÁREA I/2",
    "18º BATALHÃO DE POLÍCIA MILITAR",
  ].map((x) => pCenter(x, { bold: true, size: 22 }));
  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgPmma ? [imgPmma] : [] })] }),
      new TableCell({ width: { size: 52, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgMa ? [imgMa] : [] }), ...org] }),
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: imgBpm ? [imgBpm] : [] })] }),
    ] })],
  });

  const epigrafe = pCenter(`${proc} · Portaria nº ${numRef}${reg.objeto?.trim() ? ` — apuração de: ${reg.objeto}` : ""}`, { size: 18 });

  let corpo: Paragraph[] = [];
  if (modelo === "autuacao") {
    corpo = [
      pCenter("TERMO DE AUTUAÇÃO", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t(dataExt + " eu, "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(", Encarregado(a) designado(a) pela Portaria nº "), b(numRef),
        t(", AUTUO a referida Portaria e os documentos que a acompanham, dando início aos autos do presente procedimento. Do que, para constar, lavrei o presente termo, que vai por mim assinado."),
      ], true),
      ...assinatura("Encarregado(a) do procedimento"),
    ];
  } else if (modelo === "juntada") {
    corpo = [
      pCenter("TERMO DE JUNTADA", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t(dataExt + " eu, "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(", Encarregado(a) do procedimento em epígrafe, procedo à JUNTADA aos presentes autos do(s) seguinte(s) documento(s):"),
      ], true),
      ...linhas(8),
      just([t("Do que, para constar, lavrei o presente termo, que vai por mim assinado.")]),
      ...assinatura("Encarregado(a) do procedimento"),
    ];
  } else if (modelo === "notificacao") {
    corpo = [
      pCenter("NOTIFICAÇÃO / INTIMAÇÃO", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t("Pelo presente, fica "), (reg.envolvido?.trim() ? b(reg.envolvido) : t(BR)),
        t(" NOTIFICADO(A) a comparecer perante o(a) Encarregado(a) do(a) " + proc + ", instaurado(a) pela Portaria nº "),
        b(numRef), t(", no dia " + BR + " às ______ horas, na sede do 18º Batalhão de Polícia Militar, a fim de:"),
      ], true),
      new Paragraph({ spacing: { after: 120 }, children: [t("[  ] ser ouvido(a)   [  ] apresentar defesa   [  ] acompanhar os trabalhos   [  ] tomar ciência")] }),
      new Paragraph({ spacing: { after: 160 }, children: [t("na condição de " + BR + ".")] }),
      just([t("Fica o(a) notificado(a) ciente de que lhe são assegurados o contraditório e a ampla defesa, podendo fazer-se acompanhar de advogado e indicar testemunhas, na forma da lei.")]),
      pCenter(`Presidente Dutra-MA, ______ de ____________________ de ${ANO}.`, { size: 24 }),
      ...assinatura("Encarregado(a) do procedimento"),
      new Paragraph({ spacing: { before: 240 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000" } }, children: [b("CIÊNCIA DO(A) NOTIFICADO(A)")] }),
      new Paragraph({ spacing: { after: 120 }, children: [t("Recebi a presente notificação em " + BR + ", ciente do dia e hora acima.")] }),
      ...assinatura("Assinatura do(a) notificado(a)"),
    ];
  } else if (modelo === "declaracoes") {
    corpo = [
      pCenter("TERMO DE DECLARAÇÕES", { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t(dataExt + " perante mim, "), (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(", Encarregado(a) do procedimento em epígrafe, presente o(a) declarante abaixo qualificado(a), que aos costumes disse nada e, inquirido(a) sobre os fatos objeto de apuração, RESPONDEU:"),
      ], true),
      sub("Qualificação:"),
      new Paragraph({ spacing: { after: 40 }, children: [t("Nome: " + BR + BR + "  Posto/Grad: " + BR)] }),
      new Paragraph({ spacing: { after: 40 }, children: [t("Matrícula: " + BR + "  Lotação: " + BR + BR)] }),
      new Paragraph({ spacing: { after: 120 }, children: [t("Condição: [  ] Testemunha   [  ] Declarante   [  ] Acusado(a)   [  ] Vítima")] }),
      sub("ÀS PERGUNTAS RESPONDEU QUE:"),
      ...linhas(12),
      just([t("Nada mais havendo, encerra-se o presente termo que, lido e achado conforme, vai devidamente assinado.")]),
      ...assinatura("Declarante"),
      ...assinatura("Encarregado(a)"),
    ];
  } else if (modelo === "solucao") {
    const c = SOL[reg.tipo] || SOL.sindicancia;
    corpo = [
      pCenter(c.titulo, { bold: true, size: 26, underline: true }),
      new Paragraph({ text: "" }),
      just([
        t("Pelas conclusões das averiguações Policiais Militares a que chegou o "),
        (reg.encarregado?.trim() ? b(reg.encarregado) : t(BR)),
        t(`, ${c.agente} ${c.agente === "sindicante" ? "desta" : "deste"} ${c.procNome}, mandada proceder por este Comando, mediante `),
        b("Portaria nº " + numRef), t(", datada de "), b(dataExtenso(reg.dataInstauracao)),
        t(", com vistas a apurar "), (reg.objeto?.trim() ? b(reg.objeto) : t(BR + BR)), t("."),
      ], true),
      just([t(`À detida análise dos autos, concordo com o parecer conclusivo do ${c.agente}, pelos fundamentos a seguir expostos.`)], true),
      ...linhas(6),
      just([t("Face ao acima exposto e ao que dos autos consta, "), b("RESOLVO"), t(":")]),
      item(`a) Concordar com o Relatório do ${c.agente === "sindicante" ? "Sindicante" : "Encarregado"}, por entender que o conjunto probatório não revela a prática de transgressão disciplinar;`),
      item(`b) Publicar em Boletim Interno o Relatório e a presente ${c.presente};`),
      item(`c) Dar ciência da presente decisão ao ${c.sindicado};`),
      item("d) Remeter, via digital, cópia do relatório e da solução à Diretoria de Pessoal, para fins de controle;"),
      item("e) Arquivar cópia integral dos autos na 1ª Seção do 18º BPM, para fins de controle e registro administrativo."),
      new Paragraph({ text: "" }),
      pCenter(`Quartel do 18º BPM, em Presidente Dutra, ______ de ____________________ de ${ANO}.`, { size: 24 }),
      ...assinatura("CMT DO 18º BPM", comandante || "Comandante do 18º BPM"),
    ];
  } else {
    corpo = [
      pCenter("RELATÓRIO FINAL", { bold: true, size: 26, underline: true }),
      new Paragraph({ spacing: { after: 120 }, children: [t("Senhor Comandante,")] }),
      just([
        t("Em cumprimento à Portaria nº "), b(numRef), t(", que instaurou " + proc),
        ...(reg.dataInstauracao?.trim() ? [t(" em "), b(dBR(reg.dataInstauracao))] : []),
        t(" para apurar "), (reg.objeto?.trim() ? b(reg.objeto) : t(BR + BR)),
        t(", venho, na condição de Encarregado(a), apresentar o relatório dos trabalhos realizados."),
      ], true),
      sub("I — DOS FATOS"), ...linhas(4),
      sub("II — DAS DILIGÊNCIAS REALIZADAS"), ...linhas(4),
      sub("III — DA ANÁLISE"), ...linhas(4),
      sub("IV — DA CONCLUSÃO"), ...linhas(3),
      just([t("É o relatório, que submeto à apreciação e deliberação de Vossa Senhoria.")]),
      new Paragraph({ text: "" }),
      pCenter(`Presidente Dutra-MA, ______ de ____________________ de ${ANO}.`, { size: 24 }),
      ...assinatura("Encarregado(a) do procedimento", reg.encarregado?.trim() || undefined),
    ];
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 1130, right: 1130 } } },
      children: [
        cabecalho,
        pCenter("Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000", { size: 16 }),
        pCenter("TELEFAX: (99) 98497-1918 (Permanência) — 18batalhaopmma@gmail.com", { size: 16 }),
        epigrafe, new Paragraph({ text: "" }), ...corpo,
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
