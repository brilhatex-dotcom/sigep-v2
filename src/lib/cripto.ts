import crypto from "crypto";
import { segredoApp } from "@/lib/segredo";

/* =========================================================================
   Criptografia de dados sensíveis em repouso (CPF, dados bancários).
   AES-256-GCM. A chave deriva do NEXTAUTH_SECRET (não exige nova env). Valores
   cifrados ficam com o prefixo "enc:1:"; valores antigos (texto puro, sem
   prefixo) continuam legíveis e são cifrados na próxima gravação — migração
   transparente, sem precisar mexer nos dados existentes.
   ATENÇÃO: se o NEXTAUTH_SECRET mudar, os dados cifrados ficam ilegíveis.
   ========================================================================= */

const PREFIXO = "enc:1:";

function chave(): Buffer {
  const base = segredoApp();
  return crypto.createHash("sha256").update(base, "utf8").digest(); // 32 bytes
}

export function estaCifrado(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(PREFIXO);
}

export function cifrar(txt: string | null | undefined): string | null | undefined {
  if (txt === null || txt === undefined) return txt;
  const s = String(txt);
  if (s === "" || estaCifrado(s)) return s; // vazio ou já cifrado: não mexe
  try {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", chave(), iv);
    const ct = Buffer.concat([c.update(s, "utf8"), c.final()]);
    const tag = c.getAuthTag();
    return PREFIXO + Buffer.concat([iv, tag, ct]).toString("base64");
  } catch { return s; } // nunca quebra a gravação
}

export function decifrar(v: string | null | undefined): string | null | undefined {
  if (v === null || v === undefined) return v;
  const s = String(v);
  if (!s.startsWith(PREFIXO)) return s; // texto puro (legado): devolve como está
  try {
    const buf = Buffer.from(s.slice(PREFIXO.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return s; } // se falhar, devolve o cifrado (não quebra a leitura)
}

// Campos sensíveis do Efetivo cifrados em repouso.
export const CAMPOS_SENSIVEIS = ["cpf", "banco", "agencia", "conta"] as const;
