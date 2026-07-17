import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/* =========================================================================
   Centro de Comando — controle de entrada/saída em TABELA PRÓPRIA (uma linha
   por movimentação). Mesmo motivo do disciplinar: antes era um array JSON num
   único Config ("cc_acessos"), o que fazia dois admins se sobrescreverem.
   Tabela criada em runtime (o deploy não roda db push) e Config migrado 1x.
   ========================================================================= */

/* tipo:
   - "saida"   : policial deixou/foi transferido da unidade (destino = para onde)
   - "chegada" : policial novo chegou/foi apresentado na unidade (destino = origem)
   Os campos de hora/retorno permanecem na tabela por compatibilidade, mas não
   são mais usados na tela (movimentação de efetivo é por DATA, não por hora). */
export type Mov = {
  id: string; efetivoId: string; nome: string; tipo: "saida" | "chegada";
  data: string; horaSaida: string; destino: string; motivo: string;
  horaEntrada: string; dataEntrada: string; status: "fora" | "retornou";
  obs: string; registradoPor: string; criadoEm: string;
};

const CONFIG_CHAVE = "cc_acessos";
const FLAG_MIGRADO = "cc_acessos_migrado_tabela";

let pronto: Promise<void> | null = null;

function garantir(): Promise<void> {
  if (!pronto) pronto = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS cc_acesso (
        id text PRIMARY KEY,
        efetivo_id text NOT NULL DEFAULT '',
        nome text NOT NULL DEFAULT '',
        data text NOT NULL DEFAULT '',
        hora_saida text NOT NULL DEFAULT '',
        destino text NOT NULL DEFAULT '',
        motivo text NOT NULL DEFAULT '',
        hora_entrada text NOT NULL DEFAULT '',
        data_entrada text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'fora',
        obs text NOT NULL DEFAULT '',
        registrado_por text NOT NULL DEFAULT '',
        criado_em text NOT NULL DEFAULT ''
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS cc_acesso_data_idx ON cc_acesso (data)`);
    // coluna nova (movimentação de efetivo): saida | chegada
    await prisma.$executeRawUnsafe(`ALTER TABLE cc_acesso ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'saida'`);

    const flag = await prisma.config.findUnique({ where: { chave: FLAG_MIGRADO } });
    if (!flag) {
      try {
        const row = await prisma.config.findUnique({ where: { chave: CONFIG_CHAVE } });
        const lista: any[] = row?.valor ? JSON.parse(row.valor) : [];
        for (const r of Array.isArray(lista) ? lista : []) {
          if (!r?.id) continue;
          await inserir(normaliza(r), true);
        }
      } catch (e) { console.error("[ccAcessoDb] migração", e); }
      await prisma.config.upsert({
        where: { chave: FLAG_MIGRADO },
        update: { valor: new Date().toISOString() },
        create: { chave: FLAG_MIGRADO, valor: new Date().toISOString(), descricao: "Marca que o Centro de Comando foi migrado do Config para tabela própria" },
      });
    }
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

function s(v: any) { return String(v ?? "").trim(); }
export function normaliza(b: any, base?: Mov): Mov {
  return {
    id: base?.id || b?.id || crypto.randomUUID(),
    efetivoId: s(b?.efetivoId ?? b?.efetivo_id) || base?.efetivoId || "",
    nome: s(b?.nome) || base?.nome || "",
    tipo: (b?.tipo === "chegada" || b?.tipo === "saida") ? b.tipo : (base?.tipo || "saida"),
    data: s(b?.data) || base?.data || new Date().toISOString().slice(0, 10),
    horaSaida: s(b?.horaSaida ?? b?.hora_saida) || base?.horaSaida || "",
    destino: s(b?.destino) || base?.destino || "",
    motivo: s(b?.motivo) || base?.motivo || "",
    horaEntrada: b?.horaEntrada !== undefined || b?.hora_entrada !== undefined ? s(b?.horaEntrada ?? b?.hora_entrada) : (base?.horaEntrada || ""),
    dataEntrada: b?.dataEntrada !== undefined || b?.data_entrada !== undefined ? s(b?.dataEntrada ?? b?.data_entrada) : (base?.dataEntrada || ""),
    status: (b?.status === "retornou" || b?.status === "fora") ? b.status : (base?.status || "fora"),
    obs: b?.obs !== undefined ? s(b?.obs) : (base?.obs || ""),
    registradoPor: base?.registradoPor || s(b?.registradoPor ?? b?.registrado_por),
    criadoEm: base?.criadoEm || s(b?.criadoEm ?? b?.criado_em) || new Date().toISOString(),
  };
}

function daLinha(r: any): Mov {
  return {
    id: r.id, efetivoId: r.efetivo_id, nome: r.nome, tipo: r.tipo === "chegada" ? "chegada" : "saida",
    data: r.data, horaSaida: r.hora_saida,
    destino: r.destino, motivo: r.motivo, horaEntrada: r.hora_entrada, dataEntrada: r.data_entrada,
    status: r.status === "retornou" ? "retornou" : "fora", obs: r.obs, registradoPor: r.registrado_por, criadoEm: r.criado_em,
  };
}

async function inserir(m: Mov, ignorarConflito = false): Promise<void> {
  const conflito = ignorarConflito ? "ON CONFLICT (id) DO NOTHING" : "";
  await prisma.$executeRawUnsafe(
    `INSERT INTO cc_acesso
       (id,efetivo_id,nome,tipo,data,hora_saida,destino,motivo,hora_entrada,data_entrada,status,obs,registrado_por,criado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ${conflito}`,
    m.id, m.efetivoId, m.nome, m.tipo, m.data, m.horaSaida, m.destino, m.motivo,
    m.horaEntrada, m.dataEntrada, m.status, m.obs, m.registradoPor, m.criadoEm,
  );
}

export async function listar(ano?: string): Promise<{ itens: Mov[]; anos: string[] }> {
  await garantir();
  const rows: any[] = ano
    ? await prisma.$queryRawUnsafe(`SELECT * FROM cc_acesso WHERE substring(data,1,4) = $1 ORDER BY data DESC, hora_saida DESC`, ano)
    : await prisma.$queryRawUnsafe(`SELECT * FROM cc_acesso ORDER BY data DESC, hora_saida DESC`);
  const anosRows: any[] = await prisma.$queryRawUnsafe(`SELECT DISTINCT substring(data,1,4) AS ano FROM cc_acesso WHERE data <> '' ORDER BY ano DESC`);
  return { itens: rows.map(daLinha), anos: anosRows.map((r) => r.ano).filter(Boolean) };
}

export async function obter(id: string): Promise<Mov | null> {
  await garantir();
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM cc_acesso WHERE id = $1 LIMIT 1`, id);
  return rows[0] ? daLinha(rows[0]) : null;
}

export async function criar(b: any, quem: string): Promise<Mov> {
  await garantir();
  const m = normaliza(b);
  m.registradoPor = quem || "—";
  await inserir(m);
  return m;
}

export async function registrarRetorno(id: string, horaEntrada: string, dataEntrada: string): Promise<boolean> {
  await garantir();
  const atual = await obter(id);
  if (!atual) return false;
  await prisma.$executeRawUnsafe(
    `UPDATE cc_acesso SET hora_entrada=$2, data_entrada=$3, status='retornou' WHERE id=$1`,
    id, horaEntrada, dataEntrada,
  );
  return true;
}

export async function atualizar(id: string, b: any): Promise<boolean> {
  await garantir();
  const atual = await obter(id);
  if (!atual) return false;
  const m = normaliza(b, atual);
  await prisma.$executeRawUnsafe(
    `UPDATE cc_acesso SET
       efetivo_id=$2, nome=$3, tipo=$4, data=$5, hora_saida=$6, destino=$7, motivo=$8,
       hora_entrada=$9, data_entrada=$10, status=$11, obs=$12
     WHERE id=$1`,
    id, m.efetivoId, m.nome, m.tipo, m.data, m.horaSaida, m.destino, m.motivo,
    m.horaEntrada, m.dataEntrada, m.status, m.obs,
  );
  return true;
}

export async function remover(id: string): Promise<void> {
  await garantir();
  await prisma.$executeRawUnsafe(`DELETE FROM cc_acesso WHERE id = $1`, id);
}
