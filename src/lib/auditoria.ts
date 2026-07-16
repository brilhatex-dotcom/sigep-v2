import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { headers } from "next/headers";
import crypto from "crypto";

/* =========================================================================
   src/lib/auditoria.ts  — registro central de auditoria.

   Use em qualquer rota/acao sensivel:

     import { registrar } from "@/lib/auditoria";
     await registrar({
       acao: "editar_ficha",
       alvo: militar.id,
       alvoNome: militar.nome,
       antes: dadosAntigos,   // objeto (vira JSON)
       depois: dadosNovos,    // objeto (vira JSON)
       detalhe: "Alterou lotacao e telefone",
     });

   O autor (quem fez) e descoberto sozinho pela sessao.
   O IP e capturado sozinho dos headers da requisicao (x-forwarded-for).
   Nunca quebra a acao principal: se a auditoria falhar, apenas loga no console.
   ========================================================================= */

type RegistroEntrada = {
  acao: string;
  alvo?: string | null;
  alvoNome?: string | null;
  detalhe?: string | null;
  antes?: unknown;
  depois?: unknown;
  // opcional: passar autor manualmente (ex: no proprio login, antes da sessao existir)
  autorLogin?: string | null;
  autorNome?: string | null;
  // opcional: passar IP manualmente; se ausente, e capturado dos headers.
  ip?: string | null;
};

function comoJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* Captura o IP da requisicao atual a partir dos headers.
   Funciona em Route Handlers, Server Actions e Server Components do Next 14.
   Ordem de preferencia: x-forwarded-for (primeiro IP) > x-real-ip.
   Fora de um contexto de requisicao, retorna null sem quebrar. */
function capturarIp(): string | null {
  try {
    const h = headers();
    const xff = h.get("x-forwarded-for");
    if (xff) {
      const primeiro = xff.split(",")[0]?.trim();
      if (primeiro) return primeiro;
    }
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    return null;
  } catch {
    // headers() lanca se chamado fora de um contexto de requisicao
    return null;
  }
}

// "Celular · Android · Chrome" a partir do user-agent (celular ou computador).
export function dispositivoDe(ua: string | null | undefined): string {
  const s = (ua || "").toLowerCase();
  if (!s) return "";
  const tipo = /ipad|tablet/.test(s) ? "Tablet"
    : /mobi|android|iphone|ipod/.test(s) ? "Celular" : "Computador";
  const so = /android/.test(s) ? "Android"
    : /iphone|ipad|ipod|ios/.test(s) ? "iOS"
    : /windows/.test(s) ? "Windows"
    : /mac os|macintosh/.test(s) ? "macOS"
    : /linux/.test(s) ? "Linux" : "";
  const nav = /edg\//.test(s) ? "Edge"
    : /opr\/|opera/.test(s) ? "Opera"
    : /chrome|crios/.test(s) ? "Chrome"
    : /firefox|fxios/.test(s) ? "Firefox"
    : /safari/.test(s) ? "Safari" : "";
  return [tipo, so, nav].filter(Boolean).join(" · ");
}
function capturarDispositivo(): string | null {
  try { return dispositivoDe(headers().get("user-agent")) || null; } catch { return null; }
}

// Garante as colunas novas mesmo sem "prisma db push" (idempotente, roda 1x).
let colsPronto: Promise<void> | null = null;
export function garantirColunasAuditoria(): Promise<void> { return garantirColunas(); }
function garantirColunas(): Promise<void> {
  if (!colsPronto) colsPronto = (async () => {
    await prisma.$executeRawUnsafe(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS "Dispositivo" text`);
    await prisma.$executeRawUnsafe(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS "Hash" text`);
    await prisma.$executeRawUnsafe(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS "HashAnterior" text`);
  })().catch((e) => { colsPronto = null; throw e; });
  return colsPronto;
}

// Conteúdo canônico de um registro para o lacre (hash).
function conteudoLacre(r: { quandoIso: string; autorLogin?: string | null; autorNome?: string | null; acao: string; alvo?: string | null; alvoNome?: string | null; detalhe?: string | null; antes?: string | null; depois?: string | null; ip?: string | null; dispositivo?: string | null }): string {
  return [r.quandoIso, r.autorLogin, r.autorNome, r.acao, r.alvo, r.alvoNome, r.detalhe, r.antes, r.depois, r.ip, r.dispositivo]
    .map((x) => (x ?? "")).join("");
}
function calcularHash(hashAnterior: string, conteudo: string): string {
  return crypto.createHash("sha256").update((hashAnterior || "GENESIS") + "" + conteudo, "utf8").digest("hex");
}

export async function registrar(e: RegistroEntrada): Promise<void> {
  try {
    let autorLogin = e.autorLogin ?? null;
    let autorNome = e.autorNome ?? null;

    if (!autorLogin) {
      const session = await getServerSession(authOptions);
      if (session?.user) {
        autorLogin = (session.user as any).login ?? null;
        autorNome = session.user.name ?? null;
      }
    }

    // IP e dispositivo: usa o passado manualmente; senao captura dos headers.
    const ip = e.ip ?? capturarIp();
    const dispositivo = capturarDispositivo();

    await garantirColunas();

    const quando = new Date();
    const antes = comoJson(e.antes);
    const depois = comoJson(e.depois);

    // ---- lacre (hash encadeado) ----
    // pega o hash do ultimo registro lacrado para encadear (tamper-evidence).
    let hashAnterior = "GENESIS";
    try {
      const ultimo: any = await prisma.auditoria.findFirst({
        where: { hash: { not: null } } as any,
        orderBy: { quando: "desc" },
        select: { hash: true } as any,
      });
      if (ultimo?.hash) hashAnterior = ultimo.hash;
    } catch {}

    const conteudo = conteudoLacre({
      quandoIso: quando.toISOString(), autorLogin, autorNome, acao: e.acao,
      alvo: e.alvo ?? null, alvoNome: e.alvoNome ?? null, detalhe: e.detalhe ?? null,
      antes, depois, ip, dispositivo,
    });
    const hash = calcularHash(hashAnterior, conteudo);

    await prisma.auditoria.create({
      data: {
        quando,
        acao: e.acao,
        alvo: e.alvo ?? null,
        alvoNome: e.alvoNome ?? null,
        detalhe: e.detalhe ?? null,
        antes,
        depois,
        autorLogin,
        autorNome,
        ip,
        dispositivo,
        hash,
        hashAnterior,
      } as any,
    });
  } catch (err) {
    // auditoria nunca derruba a acao principal
    console.error("[auditoria] falha ao registrar:", err);
  }
}

/* Compara dois objetos e devolve so os campos que mudaram (antes/depois),
   util para registrar edicoes de ficha sem gravar o objeto inteiro. */
/* Verifica o LACRE (cadeia de hash): detecta se algum registro foi alterado
   (o hash não bate com o conteúdo) ou removido (um hashAnterior aponta para um
   registro que não existe mais). Só considera os registros já lacrados. */
export async function verificarCadeia(): Promise<{ total: number; verificados: number; ok: boolean; problemas: { id: string; quando: string; motivo: string }[] }> {
  const problemas: { id: string; quando: string; motivo: string }[] = [];
  let verificados = 0, total = 0;
  try {
    await garantirColunas();
    const regs: any[] = await prisma.auditoria.findMany({ orderBy: { quando: "asc" } });
    total = regs.length;
    const lacrados = regs.filter((r) => r.hash);
    const hashesExistentes = new Set<string>(lacrados.map((r) => r.hash));
    for (const r of lacrados) {
      verificados++;
      const conteudo = conteudoLacre({
        quandoIso: new Date(r.quando).toISOString(), autorLogin: r.autorLogin, autorNome: r.autorNome,
        acao: r.acao, alvo: r.alvo, alvoNome: r.alvoNome, detalhe: r.detalhe, antes: r.antes, depois: r.depois,
        ip: r.ip, dispositivo: r.dispositivo,
      });
      const esperado = calcularHash(r.hashAnterior || "GENESIS", conteudo);
      if (esperado !== r.hash) {
        problemas.push({ id: r.id, quando: new Date(r.quando).toISOString(), motivo: "Conteúdo alterado após o registro (lacre não confere)." });
      } else if (r.hashAnterior && r.hashAnterior !== "GENESIS" && !hashesExistentes.has(r.hashAnterior)) {
        problemas.push({ id: r.id, quando: new Date(r.quando).toISOString(), motivo: "Registro anterior removido (elo da corrente faltando)." });
      }
    }
  } catch (err) {
    console.error("[auditoria] verificarCadeia", err);
  }
  return { total, verificados, ok: problemas.length === 0, problemas };
}

/* ---------------- ÂNCORA EXTERNA DO LACRE ----------------
   O "selo" é o hash do último registro + a contagem. Você registra uma âncora e
   guarda esse selo FORA do sistema (imprime/salva/e-mail). Se um dia alguém
   reescrever a corrente inteira, o hash antigo que você guardou não vai mais
   existir na base — e o "conferir" acusa. É o que dá peso externo ao lacre. */
const CHAVE_ANCORAS = "auditoria_ancoras";

export async function seloAtual(): Promise<{ count: number; ultimoHash: string | null; em: string }> {
  try {
    await garantirColunas();
    const total = await prisma.auditoria.count({ where: { hash: { not: null } } as any });
    const ult: any = await prisma.auditoria.findFirst({ where: { hash: { not: null } } as any, orderBy: { quando: "desc" }, select: { hash: true } as any });
    return { count: total, ultimoHash: ult?.hash ?? null, em: new Date().toISOString() };
  } catch { return { count: 0, ultimoHash: null, em: new Date().toISOString() }; }
}

export async function registrarAncora(por: string): Promise<{ count: number; ultimoHash: string | null; em: string; por: string }> {
  const s = await seloAtual();
  const item = { ...s, por };
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_ANCORAS } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    (Array.isArray(lista) ? lista : []).push(item);
    await prisma.config.upsert({
      where: { chave: CHAVE_ANCORAS },
      update: { valor: JSON.stringify(lista) },
      create: { chave: CHAVE_ANCORAS, valor: JSON.stringify(lista), descricao: "Âncoras (selos) do lacre da auditoria" },
    });
  } catch {}
  return item;
}

export async function lerAncoras(): Promise<{ count: number; ultimoHash: string | null; em: string; por: string }[]> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE_ANCORAS } });
    const l = row?.valor ? JSON.parse(row.valor) : [];
    return (Array.isArray(l) ? l : []).slice().reverse();
  } catch { return []; }
}

// Confere se um hash de âncora salvo externamente ainda existe na corrente.
export async function conferirAncora(hash: string): Promise<{ existe: boolean }> {
  try {
    await garantirColunas();
    const r = await prisma.auditoria.findFirst({ where: { hash: (hash || "").trim() } as any, select: { id: true } as any });
    return { existe: !!r };
  } catch { return { existe: false }; }
}

export function diferenca(
  antigo: Record<string, any>,
  novo: Record<string, any>
): { antes: Record<string, any>; depois: Record<string, any>; campos: string[] } {
  const antes: Record<string, any> = {};
  const depois: Record<string, any> = {};
  const campos: string[] = [];
  const chaves = new Set([...Object.keys(antigo || {}), ...Object.keys(novo || {})]);
  for (const k of chaves) {
    const a = antigo ? antigo[k] : undefined;
    const d = novo ? novo[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      antes[k] = a ?? null;
      depois[k] = d ?? null;
      campos.push(k);
    }
  }
  return { antes, depois, campos };
}