import {
  ORG, MESES, textoPeriodos, trechosComGuerra, type EquipePlano, type OpcoesPlanoXlsx,
} from "@/lib/planoFeriasXlsx";

/* =========================================================================
   PLANO DE FÉRIAS para IMPRIMIR / salvar em PDF — o MESMO papel do Excel
   (lib/planoFeriasXlsx), página A4 em pé:
     · cabeçalho da escala: 190 anos da PMMA, armas do MA com o texto do
       órgão e o brasão do 18º BPM;
     · PRAÇAS: VISTO do Cmt à esquerda do título, uma tabela por equipe
       (cabeçalho cinza), e no fim a assinatura do Chefe do P/1;
     · OFICIAIS: uma tabela só, em hierarquia, e no fim o Cmt da unidade;
     · "todos": oficiais e, em folha nova, as praças.
   O recorte (só oficiais / só praças) é o da aba aberta na tela.
   ========================================================================= */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// imagem: caminho de /public ou data URL (a assinatura enviada na escala)
const img = (src: string | undefined, classe: string) =>
  src ? `<img class="${classe}" src="${esc(src)}" alt="">` : "";

/* As colunas da IMPRESSÃO: as do Excel (os modelos do P/1) mais o LOCAL
   onde o militar serve, que a impressão antiga trazia e o P/1 pediu de
   volta. Larguras em % da folha em pé. */
type ColImp = { titulo: string; pct: number };
const IMP_PRACAS: ColImp[] = [
  { titulo: "ORD", pct: 4 }, { titulo: "GRAD", pct: 9 }, { titulo: "NUMERO", pct: 7 }, { titulo: "NOME", pct: 24 },
  { titulo: "ID", pct: 7 }, { titulo: "MATRÍCULA", pct: 9 }, { titulo: "LOCAL", pct: 14 }, { titulo: "EQUIPE", pct: 6 },
  { titulo: "PERIODO", pct: 20 },
];
const IMP_OFICIAIS: ColImp[] = [
  { titulo: "ORD", pct: 5 }, { titulo: "POSTO", pct: 15 }, { titulo: "NOME", pct: 35 }, { titulo: "MATRICULA", pct: 11 },
  { titulo: "ID", pct: 10 }, { titulo: "LOCAL", pct: 16 }, { titulo: "EQUIPE", pct: 8 },
];
const colgroup = (cols: ColImp[]) => `<colgroup>${cols.map((c) => `<col style="width:${c.pct}%">`).join("")}</colgroup>`;
const thead = (cols: ColImp[]) => `<thead><tr>${cols.map((c) => `<th>${esc(c.titulo)}</th>`).join("")}</tr></thead>`;

function nomeHtml(nome: string | null, guerra: string | null): string {
  return trechosComGuerra(nome || "", guerra).map((x) => (x.b ? `<b>${esc(x.t)}</b>` : esc(x.t))).join("");
}

function cabecalho(op: OpcoesPlanoXlsx): string {
  return `
    <div class="cab">
      <div class="lado">${img(op.brasoes.pmma, "pmma")}</div>
      <div class="org">
        ${img(op.brasoes.ma, "ma")}
        ${ORG.map((t, i) => `<p class="${i === 4 ? "forte" : ""}">${esc(t)}</p>`).join("")}
      </div>
      <div class="lado">${img(op.brasoes.bpm, "bpm")}</div>
    </div>`;
}

function fecho(op: OpcoesPlanoXlsx, assina: "cmt" | "p1"): string {
  const hoje = op.hoje ?? new Date();
  const q = assina === "p1"
    ? { nome: op.p1.nome, cargo: op.p1.funcao, assinatura: op.p1.assinatura }
    : { nome: op.cmt.nome, cargo: op.cmt.cargo || "Comandante do 18º BPM", assinatura: op.cmt.assinatura };
  return `
    <div class="fecho">
      <p class="quartel">Quartel do 18º BPM, em Presidente Dutra-MA, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}.</p>
      <div class="ass">${img(q.assinatura, "rubrica")}</div>
      <p class="nome">${esc((q.nome || "").toUpperCase() || "________________________________")}</p>
      <p class="cargo">${esc(q.cargo || "")}</p>
    </div>`;
}

function folhaPracas(equipes: EquipePlano[], op: OpcoesPlanoXlsx): string {
  const blocos = equipes
    .map((e) => ({ ...e, membros: e.membros.filter((m) => !m.oficial) }))
    .filter((e) => e.membros.length);
  const tabelas = blocos.map((e) => {
    // dois períodos: um em cada linha, para caber na coluna
    const periodo = textoPeriodos(e.periodos).split(" e ").map(esc).join("<br>");
    const linhas = e.membros.map((m, i) => `
      <tr>
        <td class="c g">${i + 1}</td><td class="c">${esc(m.postoGrad || "-------")}</td>
        <td class="c">${esc(m.numeroBarra || "-------")}</td><td class="c">${nomeHtml(m.nome, m.nomeGuerra)}</td>
        <td class="c">${esc(m.id || "-------")}</td><td class="c">${esc(m.matricula || "-------")}</td>
        <td class="c local">${esc(m.lotacao || "—")}</td>
        <td class="c g">${esc(e.numero)}</td><td class="c g">${periodo}</td>
      </tr>`).join("");
    return `
      <table class="pracas">${colgroup(IMP_PRACAS)}
        ${thead(IMP_PRACAS)}
        <tbody>${linhas}</tbody>
      </table>`;
  });
  return `
    <section class="folha">
      ${cabecalho(op)}
      <div class="titulo-visto">
        <div class="visto">
          <p class="v">VISTO</p>
          ${img(op.cmt.assinatura, "rubrica-visto")}
          <p class="cmt">Cmt. do 18º BPM</p>
        </div>
        <p class="titulo">PLANO DE FÉRIAS DOS PRAÇAS DO 18º BPM REFERENTE AO EXERCÍCIO DE ${esc(op.ano)}.</p>
      </div>
      ${tabelas.length ? tabelas.join("") : `<p class="vazio">Nenhuma praça neste plano.</p>`}
      ${fecho(op, "p1")}
    </section>`;
}

function folhaOficiais(equipes: EquipePlano[], op: OpcoesPlanoXlsx): string {
  const oficiais = equipes
    .flatMap((e) => e.membros.filter((m) => m.oficial).map((m) => ({ m, equipe: e.numero })))
    .sort((a, b) => a.m.antiguidade - b.m.antiguidade);
  const linhas = oficiais.map(({ m, equipe }, i) => `
    <tr>
      <td class="c">${i + 1}</td><td class="c">${esc(m.postoGrad || "-------")}</td>
      <td>${nomeHtml(m.nome, m.nomeGuerra)}</td><td class="c">${esc(m.matricula || "-------")}</td>
      <td class="c">${esc(m.id || "-------")}</td><td class="c local">${esc(m.lotacao || "—")}</td><td class="c">${esc(equipe)}</td>
    </tr>`).join("");
  return `
    <section class="folha">
      ${cabecalho(op)}
      <p class="titulo so">PLANO DE FÉRIAS DOS OFICIAIS DO 18º BPM REFERENTE AO EXERCÍCIO DE ${esc(op.ano)}.</p>
      ${oficiais.length ? `
        <table class="oficiais">${colgroup(IMP_OFICIAIS)}
          ${thead(IMP_OFICIAIS)}
          <tbody>${linhas}</tbody>
        </table>` : `<p class="vazio">Nenhum oficial neste plano.</p>`}
      ${fecho(op, "cmt")}
    </section>`;
}

const TITULO = { oficiais: "Oficiais", pracas: "Praças", todos: "Oficiais e Praças" } as const;

export function gerarPlanoFeriasHtml(equipes: EquipePlano[], op: OpcoesPlanoXlsx): string {
  const folhas = [
    op.quem !== "pracas" ? folhaOficiais(equipes, op) : "",
    op.quem !== "oficiais" ? folhaPracas(equipes, op) : "",
  ].filter(Boolean).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Plano de Férias ${esc(op.ano)} - ${TITULO[op.quem]} - 18º BPM</title>
<style>
  @page { size: A4 portrait; margin: 10mm 9mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font-family: "Times New Roman", Times, serif; background: #fff; }
  .folha + .folha { break-before: page; }
  .cab { display: grid; grid-template-columns: 22% 56% 22%; align-items: center; }
  .cab .lado { text-align: center; }
  .cab .pmma, .cab .bpm { max-height: 21mm; max-width: 100%; }
  .cab .org { text-align: center; }
  .cab .ma { height: 14mm; display: block; margin: 0 auto 1mm; }
  .cab .org p { margin: 0; font-size: 9.5pt; line-height: 1.25; }
  .cab .org p.forte { font-weight: bold; font-size: 10.5pt; }
  .titulo { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; text-align: center; margin: 0; }
  .titulo.so { margin: 5mm 0 4mm; }
  .titulo-visto { display: grid; grid-template-columns: 22% 1fr 22%; align-items: center; margin: 3mm 0 3mm; }
  .titulo-visto .titulo { grid-column: 2; grid-row: 1; }
  .visto { grid-column: 1; grid-row: 1; text-align: center; font-size: 8pt; }
  .visto p { margin: 0; } .visto .v { font-weight: bold; font-size: 9pt; }
  .visto .rubrica-visto { height: 10mm; display: block; margin: 0.5mm auto; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; break-inside: avoid; }
  th, td { border: 0.6pt solid #000; padding: 0.6mm 0.8mm; vertical-align: middle; }
  th { white-space: nowrap; overflow: hidden; }
  td.c, th { text-align: center; }
  table.pracas { margin-bottom: 8mm; }
  table.pracas th { background: #D9D9D9; font-weight: normal; font-size: 8pt; }
  table.pracas td { font-size: 7.5pt; height: 5.2mm; }
  table.pracas td.g { font-size: 7.5pt; white-space: nowrap; }
  td.local { font-size: 7pt; line-height: 1.15; }
  table.oficiais td.local { font-size: 8.5pt; }
  table.oficiais th { background: #C0C0C0; font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 8.5pt; }
  table.oficiais td { font-size: 10pt; height: 6mm; }
  .fecho { text-align: center; break-inside: avoid; margin-top: 4mm; }
  .fecho .quartel { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; margin: 0 0 2mm; }
  .fecho .ass { height: 16mm; display: flex; align-items: flex-end; justify-content: center; }
  .fecho .rubrica { max-height: 16mm; max-width: 60mm; }
  .fecho p { margin: 0; } .fecho .nome { font-weight: bold; font-size: 10pt; } .fecho .cargo { font-size: 10pt; }
  .vazio { font-style: italic; text-align: center; font-size: 10pt; }
  @media print { th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
${folhas}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`;
}
