import { PrismaClient, Prisma } from "@prisma/client";
import { cifrar, decifrar, CAMPOS_SENSIVEIS } from "@/lib/cripto";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/* =========================================================================
   SINAL DE MUDANÇA — o que faz as telas de OUTROS PCs se atualizarem na hora

   Toda gravação que muda o que alguma tela mostra carimba a chave
   "sinal_mudanca" da Config com um valor novo. As telas abertas perguntam só
   esse carimbo (umas dezenas de bytes, e o servidor ainda o guarda 2 s na
   memória para atender todo mundo com uma ida só ao banco) e recarregam
   apenas quando ele muda. Resultado: a mudança aparece em segundos nos outros
   PCs, e o banco não manda a tela inteira à toa quando nada mudou — que era
   o que estourava a cota de tráfego do Neon (5 GB/mês).

   Ficam de fora as gravações que nenhuma tela de outro PC precisa ver: a
   auditoria, o chat (tem o próprio ciclo), presença e push, as tentativas de
   login, a escala (tem o próprio pulso, ainda mais rápido) e as fotos.
   ========================================================================= */

const CHAVE_SINAL = "sinal_mudanca";
const ESCRITAS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const MODELOS_SEM_SINAL = new Set(["Auditoria", "ChatMensagem", "ChatConversa", "ChatPresenca", "ChatChamada", "PushSubscription"]);
// campos que a tentativa/entrada no sistema grava no usuário — não mudam tela de ninguém
const CAMPOS_DE_LOGIN = new Set(["tentativas", "bloqueadoAte", "ultimoLogin", "senhaHash", "salt"]);
const TABELAS_SEM_SINAL = /\b(chat_[a-z_]+|auditoria[a-z_]*|push_subscriptions)\b/i;
const CONFIG_SEM_SINAL = /^(escala_|foto_|sinal_|consent_lgpd)/;

function gravacaoVisivel(params: Prisma.MiddlewareParams): boolean {
  if (params.action === "executeRaw") {
    const [consulta, ...valores] = (params.args ?? []) as unknown[];
    const sql = typeof consulta === "string" ? consulta : Array.isArray(consulta) ? consulta.join(" ") : "";
    if (!/^\s*(insert|update|delete)\b/i.test(sql)) return false;      // CREATE/ALTER etc.
    if (sql.includes(CHAVE_SINAL) || TABELAS_SEM_SINAL.test(sql)) return false;
    if (/\bconfig\b/i.test(sql) && valores.some((v) => typeof v === "string" && CONFIG_SEM_SINAL.test(v))) return false;
    return true;
  }
  if (!params.model || !ESCRITAS.has(params.action)) return false;
  if (MODELOS_SEM_SINAL.has(params.model)) return false;
  const a = (params.args ?? {}) as Record<string, any>;
  if (params.model === "Usuario" && params.action === "update") {
    const campos = Object.keys(a.data ?? {});
    if (campos.length && campos.every((k) => CAMPOS_DE_LOGIN.has(k))) return false;
  }
  if (params.model === "Config") {
    const chaves = [a.where?.chave, a.create?.chave, a.data?.chave].filter((k): k is string => typeof k === "string");
    if (chaves.some((k) => CONFIG_SEM_SINAL.test(k))) return false;
  }
  return true;
}

let sinalLido: { em: number; valor: Promise<string> } | null = null;

async function carimbar(p: PrismaClient): Promise<void> {
  const valor = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  sinalLido = { em: Date.now(), valor: Promise.resolve(valor) };   // este servidor já sabe
  await p.$executeRawUnsafe(
    `INSERT INTO config ("Chave", "Valor", "Descricao") VALUES ('${CHAVE_SINAL}', $1, 'Sinal de mudança (telas ao vivo)')
     ON CONFLICT ("Chave") DO UPDATE SET "Valor" = EXCLUDED."Valor"`,
    valor,
  );
}

function novoPrisma(): PrismaClient {
  const p = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Cifra/decifra os campos sensiveis do Efetivo de forma central: toda gravacao
  // cifra, toda leitura decifra — independente da rota. Assim nenhum ponto do
  // sistema mostra dado cru por engano, e nao dependemos de mexer em cada lugar.
  p.$use(async (params, next) => {
    if (params.model === "Efetivo") {
      const acao = params.action;
      if ((acao === "create" || acao === "update" || acao === "updateMany" || acao === "upsert") && params.args?.data) {
        const cifraObj = (d: any) => { for (const c of CAMPOS_SENSIVEIS) if (c in d) d[c] = cifrar(d[c]); };
        if (acao === "upsert") { if (params.args.create) cifraObj(params.args.create); if (params.args.update) cifraObj(params.args.update); }
        else cifraObj(params.args.data);
      }
    }
    const res = await next(params);
    if (params.model === "Efetivo" && res) {
      const dec = (o: any) => { if (o && typeof o === "object") for (const c of CAMPOS_SENSIVEIS) if (typeof o[c] === "string") o[c] = decifrar(o[c]); };
      if (Array.isArray(res)) res.forEach(dec); else dec(res);
    }
    // gravou algo que outra tela mostra: carimba o sinal (falhar aqui nunca derruba a gravação)
    if (gravacaoVisivel(params)) {
      try { await carimbar(p); } catch { /* tabela config fora do ar: a tela atualiza na próxima */ }
    }
    return res;
  });

  return p;
}

export const prisma = globalForPrisma.prisma ?? novoPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/* O carimbo atual. Guardado 2 s na memória: com muita gente perguntando ao
   mesmo tempo, o banco é consultado no máximo uma vez a cada 2 s por
   servidor, e não uma vez por pessoa. */
export async function sinalDeMudanca(): Promise<string> {
  if (sinalLido && Date.now() - sinalLido.em < 2000) return sinalLido.valor;
  const valor = (async () => {
    try {
      const rows = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
        `SELECT "Valor" AS v FROM config WHERE "Chave" = '${CHAVE_SINAL}'`,
      );
      return rows[0]?.v ?? "";
    } catch {
      sinalLido = null;
      return "";
    }
  })();
  sinalLido = { em: Date.now(), valor };
  return valor;
}
