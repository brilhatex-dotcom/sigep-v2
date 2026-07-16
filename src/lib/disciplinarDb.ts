import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/* =========================================================================
   Camada de dados do DISCIPLINAR em TABELA PRÓPRIA (uma linha por procedimento).
   Motivo: antes tudo ficava num único registro Config ("disciplinar") como um
   array JSON — salvar um item reescrevia o array inteiro, então dois admins ao
   mesmo tempo se sobrescreviam (last-write-wins). Com tabela própria, cada
   INSERT/UPDATE/DELETE mexe SÓ na sua linha — sem conflito.

   Importante: o deploy não roda "prisma db push", então a tabela é criada em
   tempo de execução com CREATE TABLE IF NOT EXISTS (idempotente) e os dados
   antigos do Config são migrados uma única vez. O Config antigo é preservado
   como backup (não é apagado).
   ========================================================================= */

export type Registro = {
  id: string; tipo: string; numero: string; encarregado: string; portaria: string;
  dataInstauracao: string; envolvido: string; objeto: string; prazo: string;
  status: string; obs: string; criadoEm: string; criadoPor: string;
};

const CONFIG_CHAVE = "disciplinar";
const FLAG_MIGRADO = "disciplinar_migrado_tabela";

let pronto: Promise<void> | null = null;

// Cria a tabela (se preciso) e migra o Config antigo uma única vez.
function garantir(): Promise<void> {
  if (!pronto) pronto = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS disciplinar_procedimento (
        id text PRIMARY KEY,
        tipo text NOT NULL DEFAULT '',
        numero text NOT NULL DEFAULT '',
        encarregado text NOT NULL DEFAULT '',
        portaria text NOT NULL DEFAULT '',
        data_instauracao text NOT NULL DEFAULT '',
        envolvido text NOT NULL DEFAULT '',
        objeto text NOT NULL DEFAULT '',
        prazo text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT '',
        obs text NOT NULL DEFAULT '',
        criado_em text NOT NULL DEFAULT '',
        criado_por text NOT NULL DEFAULT ''
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS disc_proc_tipo_idx ON disciplinar_procedimento (tipo)`);
    // coluna com os números já atribuídos a cada peça deste procedimento (JSON)
    await prisma.$executeRawUnsafe(`ALTER TABLE disciplinar_procedimento ADD COLUMN IF NOT EXISTS numeros text NOT NULL DEFAULT '{}'`);
    // contador para numeração automática (chave = "<peca>_<ano>", valor sequencial)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS disciplinar_contador (
        chave text PRIMARY KEY,
        valor integer NOT NULL DEFAULT 0
      )
    `);

    // migração única: se ainda não migrou, copia o array do Config
    const flag = await prisma.config.findUnique({ where: { chave: FLAG_MIGRADO } });
    if (!flag) {
      try {
        const row = await prisma.config.findUnique({ where: { chave: CONFIG_CHAVE } });
        const lista: any[] = row?.valor ? JSON.parse(row.valor) : [];
        for (const r of Array.isArray(lista) ? lista : []) {
          if (!r?.id) continue;
          await inserir(normaliza(r), true);
        }
      } catch (e) { console.error("[disciplinarDb] migração", e); }
      await prisma.config.upsert({
        where: { chave: FLAG_MIGRADO },
        update: { valor: new Date().toISOString() },
        create: { chave: FLAG_MIGRADO, valor: new Date().toISOString(), descricao: "Marca que o disciplinar foi migrado do Config para tabela própria" },
      });
    }
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

function s(v: any) { return String(v ?? "").trim(); }
export function normaliza(b: any, base?: Registro): Registro {
  const TIPOS = ["fatd", "sindicancia", "ips", "ipm"];
  return {
    id: base?.id || b?.id || crypto.randomUUID(),
    tipo: TIPOS.includes(s(b?.tipo)) ? s(b?.tipo) : (base?.tipo || "fatd"),
    numero: s(b?.numero), encarregado: s(b?.encarregado), portaria: s(b?.portaria),
    dataInstauracao: s(b?.dataInstauracao ?? b?.data_instauracao), envolvido: s(b?.envolvido),
    objeto: s(b?.objeto), prazo: s(b?.prazo), status: s(b?.status) || "Em andamento", obs: s(b?.obs),
    criadoEm: base?.criadoEm || s(b?.criadoEm ?? b?.criado_em) || new Date().toISOString(),
    criadoPor: base?.criadoPor || s(b?.criadoPor ?? b?.criado_por),
  };
}

function daLinha(r: any): Registro {
  return {
    id: r.id, tipo: r.tipo, numero: r.numero, encarregado: r.encarregado, portaria: r.portaria,
    dataInstauracao: r.data_instauracao, envolvido: r.envolvido, objeto: r.objeto, prazo: r.prazo,
    status: r.status, obs: r.obs, criadoEm: r.criado_em, criadoPor: r.criado_por,
  };
}

async function inserir(reg: Registro, ignorarConflito = false): Promise<void> {
  const conflito = ignorarConflito ? "ON CONFLICT (id) DO NOTHING" : "";
  await prisma.$executeRawUnsafe(
    `INSERT INTO disciplinar_procedimento
       (id,tipo,numero,encarregado,portaria,data_instauracao,envolvido,objeto,prazo,status,obs,criado_em,criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ${conflito}`,
    reg.id, reg.tipo, reg.numero, reg.encarregado, reg.portaria, reg.dataInstauracao,
    reg.envolvido, reg.objeto, reg.prazo, reg.status, reg.obs, reg.criadoEm, reg.criadoPor,
  );
}

export async function listar(tipo?: string): Promise<Registro[]> {
  await garantir();
  const rows: any[] = tipo
    ? await prisma.$queryRawUnsafe(`SELECT * FROM disciplinar_procedimento WHERE tipo = $1 ORDER BY criado_em DESC`, tipo)
    : await prisma.$queryRawUnsafe(`SELECT * FROM disciplinar_procedimento ORDER BY criado_em DESC`);
  return rows.map(daLinha);
}

export async function obter(id: string): Promise<Registro | null> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM disciplinar_procedimento WHERE id = $1 LIMIT 1`, id);
  return rows[0] ? daLinha(rows[0]) : null;
}

export async function criar(b: any, criadoPor: string): Promise<Registro> {
  await garantir();
  const reg = normaliza(b);
  reg.criadoPor = criadoPor || "—";
  await inserir(reg);
  return reg;
}

export async function atualizar(id: string, b: any): Promise<boolean> {
  await garantir();
  const atual = await obter(id);
  if (!atual) return false;
  // o tipo não muda na edição (mantém o do registro)
  const reg = normaliza({ ...b, tipo: atual.tipo }, atual);
  await prisma.$executeRawUnsafe(
    `UPDATE disciplinar_procedimento SET
       numero=$2, encarregado=$3, portaria=$4, data_instauracao=$5, envolvido=$6,
       objeto=$7, prazo=$8, status=$9, obs=$10
     WHERE id=$1`,
    id, reg.numero, reg.encarregado, reg.portaria, reg.dataInstauracao, reg.envolvido,
    reg.objeto, reg.prazo, reg.status, reg.obs,
  );
  return true;
}

export async function remover(id: string): Promise<void> {
  await garantir();
  await prisma.$executeRawUnsafe(`DELETE FROM disciplinar_procedimento WHERE id = $1`, id);
}

/* Importa em lote (histórico). Pula os que já existem com o MESMO tipo+número,
   para poder colar de novo sem duplicar. Devolve quantos entraram/pularam. */
export async function importar(tipo: string, itens: any[], criadoPor: string): Promise<{ criados: number; pulados: number }> {
  await garantir();
  const TIPOS = ["fatd", "sindicancia", "ips", "ipm"];
  const t = TIPOS.includes(tipo) ? tipo : "fatd";
  const existentes: any[] = await prisma.$queryRawUnsafe(`SELECT numero FROM disciplinar_procedimento WHERE tipo = $1`, t);
  const vistos = new Set(existentes.map((r) => (r.numero || "").trim().toLowerCase()).filter(Boolean));
  let criados = 0, pulados = 0;
  for (const it of Array.isArray(itens) ? itens : []) {
    const reg = normaliza({ ...it, tipo: t });
    reg.criadoPor = criadoPor || "importação";
    const chave = reg.numero.trim().toLowerCase();
    if (!reg.numero && !reg.envolvido && !reg.objeto) continue; // linha vazia
    if (chave && vistos.has(chave)) { pulados++; continue; }
    await inserir(reg);
    if (chave) vistos.add(chave);
    criados++;
  }
  return { criados, pulados };
}
