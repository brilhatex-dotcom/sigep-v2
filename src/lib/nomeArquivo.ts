import { classificarPatente } from "@/lib/patentes";

/* =========================================================================
   NOME DOS ARQUIVOS DE DOCUMENTOS DE POLICIAL

   Todo documento de um policial que sai do sistema — baixado em Word/PDF ou
   "Imprimir → Salvar como PDF" — leva no nome a GRADUAÇÃO e o NOME DE GUERRA:
     "Memorando de Férias 2026 - Cabo Ferreira"
     "Requerimento Permanência de Armamento - Soldado Lucas"
   Antes saíam com o título da aba ("SIGEP 18º BPM") ou com matrícula/sigla, e
   o P/1 tinha de renomear um por um.

   Serve no servidor (Content-Disposition) e no navegador (download/print).
   ========================================================================= */

export type MilitarArquivo = { postoGrad?: string | null; nomeGuerra?: string | null; nome?: string | null };

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
function capitalizar(t: string): string {
  return t.toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join(" ");
}

// "Cabo Ferreira", "1º Tenente Macedo". Sem nome de guerra, o 1º e o último nome.
export function militarNoArquivo(m: MilitarArquivo | null | undefined): string {
  if (!m) return "";
  const p = classificarPatente(m.postoGrad ?? null);
  const posto = p.ordem === 99 ? String(m.postoGrad || "").trim() : p.rotulo;
  let guerra = String(m.nomeGuerra || "").trim();
  if (!guerra) {
    const partes = String(m.nome || "").trim().split(/\s+/).filter(Boolean);
    guerra = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0] || "";
  }
  return [posto, capitalizar(guerra)].filter(Boolean).join(" ").trim();
}

// tira o que o Windows não aceita em nome de arquivo
export function limparNomeArquivo(t: string): string {
  return t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

/* "Tipo - Cabo Ferreira" (sem extensão). `militar` pode vir pronto (texto)
   ou como posto/nome de guerra. */
export function nomeDocumento(tipo: string, militar?: MilitarArquivo | string | null): string {
  const quem = typeof militar === "string" ? militar.trim() : militarNoArquivo(militar);
  return limparNomeArquivo([tipo.trim(), quem].filter(Boolean).join(" - ")) || "documento";
}

/* Content-Disposition com acento certo: "filename*" (UTF-8, RFC 5987) para
   quem entende e um "filename" sem acento de reserva. */
export function disposicaoArquivo(nome: string, ext: string, inline = false): string {
  const completo = `${limparNomeArquivo(nome)}.${ext}`;
  const ascii = completo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(completo)}`;
}

/* Imprimir com o nome certo no "Salvar como PDF": o navegador sugere o TÍTULO
   da página. Troca o título só durante a impressão e devolve depois. */
export function imprimirComNome(nome: string, imprimir: () => void = () => window.print()): void {
  if (typeof document === "undefined") { imprimir(); return; }
  const antes = document.title;
  const volta = () => { document.title = antes; window.removeEventListener("afterprint", volta); };
  document.title = limparNomeArquivo(nome) || antes;
  window.addEventListener("afterprint", volta);
  try { imprimir(); } finally { setTimeout(volta, 60000); }
}

/* O nome que o servidor deu (Content-Disposition) a um arquivo baixado por
   fetch — assim a tela usa o mesmo nome "Tipo - Cabo Ferreira" do servidor. */
export function nomeDaResposta(res: Response, reserva: string): string {
  const cd = res.headers.get("Content-Disposition") || "";
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (utf) { try { return decodeURIComponent(utf[1].trim()); } catch { /* cai no simples */ } }
  return /filename="([^"]+)"/i.exec(cd)?.[1] || reserva;
}

/* De uma linha pronta "Sd PM 338/22 Danielle" (permuta) tira o posto e o nome
   de guerra — "Soldado Danielle". Com `nomeCompleto` (o "envolvido" dos
   procedimentos, "SD PM 169/24 Gleydson Robson Rocha da Silva"), o que vem
   depois da barra é o nome inteiro e fica o 1º e o último ("Soldado Gleydson
   Silva"). Havendo mais de um militar, vale o primeiro. */
export function militarDaLinha(linha: string | null | undefined, nomeCompleto = false): string {
  const t = String(linha || "").trim()
    .split(/\s*[,;]\s*|\s+e\s+(?=\S+(?:\s+\S+)?\s+PM\b)/i)[0].trim();
  const m = /^(.*?)\s+PM\s+(.*)$/i.exec(t);
  if (!m) return nomeCompleto ? militarNoArquivo({ nome: t }) : t;
  const resto = m[2].split(/\s+/).filter((w) => !/\d/.test(w)).join(" ");
  return militarNoArquivo(nomeCompleto ? { postoGrad: m[1], nome: resto } : { postoGrad: m[1], nomeGuerra: resto }) || t;
}
