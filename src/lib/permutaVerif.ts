import crypto from "crypto";
import type { Permuta } from "@/lib/permutaPedidos";
import { segredoApp } from "@/lib/segredo";

/* =========================================================================
   Verificação pública da permuta (QR Code + página /verificar).
   O QR NÃO carrega dados pessoais — carrega só o protocolo + um TOKEN assinado
   (HMAC-SHA256). A página de verificação recalcula o token a partir do registro
   ATUAL: se bater, o documento é autêntico e não foi alterado depois de impresso.
   LGPD: mínimo de dados, finalidade única (verificar autenticidade), acesso só
   com o token correto (não dá para enumerar).
   ========================================================================= */

function segredo(): string {
  return segredoApp();
}

// Campos DECISIVOS do documento: qualquer alteração muda o token.
function conteudo(p: Permuta): string {
  return [
    p.protocolo || "",
    p.solicitante?.linha || "",
    p.solicitante?.em || "",
    p.solicitado?.linha || p.solicitadoNome || "",
    p.solicitado?.em || "",
    p.dataPermuta || "",
    p.dataRetorno || "",
    p.estado || "",
    p.visto || "",
    p.p1Nome || "",
    p.p1Em || "",
    p.p1Favoravel === null || p.p1Favoravel === undefined ? "" : String(p.p1Favoravel),
    p.subcmtNome || "",
    p.subcmtEm || "",
  ].join("\x1f");
}

// Token curto e URL-safe (16 bytes -> ~22 chars base64url).
export function tokenPermuta(p: Permuta): string {
  const h = crypto.createHmac("sha256", segredo()).update(conteudo(p)).digest();
  return h.subarray(0, 16).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Confere um token recebido (comparação em tempo constante).
export function conferirToken(p: Permuta, token: string): boolean {
  const esperado = tokenPermuta(p);
  const a = Buffer.from(esperado);
  const b = Buffer.from(token || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Dados NÃO SENSÍVEIS exibidos na página pública de verificação.
export type VerifPermuta = {
  protocolo: string;
  solicitante: string;
  solicitado: string;
  dataPermuta: string;
  dataRetorno: string;
  estado: string;
  decisao: string;
  parecerP1: { nome: string; cargo: string; favoravel: boolean | null; em: string } | null;
  visto: { nome: string; sentido: string; em: string } | null;
  assinaturaSolicitante: string;
  assinaturaSolicitado: string;
};

const ROTULO_ESTADO: Record<string, string> = {
  autorizada: "AUTORIZADA",
  nao_autorizada: "NÃO AUTORIZADA",
  aguardando_solicitado: "aguardando assinatura do colega",
  aguardando_p1: "aguardando parecer do P/1",
  aguardando_subcmt: "aguardando visto do Subcomandante",
  cancelada: "cancelada",
};

export function dadosVerificacao(p: Permuta): VerifPermuta {
  return {
    protocolo: p.protocolo || "",
    solicitante: p.solicitante?.linha || "",
    solicitado: p.solicitado?.linha || p.solicitadoNome || "",
    dataPermuta: p.dataPermuta || "",
    dataRetorno: p.dataRetorno || "",
    estado: p.estado || "",
    decisao: ROTULO_ESTADO[p.estado] || p.estado || "",
    parecerP1: p.p1Nome
      ? { nome: p.p1Nome, cargo: p.p1Cargo || "", favoravel: p.p1Favoravel ?? null, em: p.p1Em || "" }
      : null,
    visto: p.subcmtNome
      ? { nome: p.subcmtNome, sentido: p.visto === "autorizado" ? "favorável" : p.visto === "nao_autorizado" ? "não favorável" : "", em: p.subcmtEm || "" }
      : null,
    assinaturaSolicitante: p.solicitante?.em || "",
    assinaturaSolicitado: p.solicitado?.em || "",
  };
}
