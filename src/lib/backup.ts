import { prisma } from "@/lib/prisma";
import { cifrar, CAMPOS_SENSIVEIS } from "@/lib/cripto";

/* =========================================================================
   Backup externo — gera um "dump" completo do sistema em JSON.
   Serve para o admin guardar uma cópia FORA do provedor do banco (Neon):
   e-mail, Google Drive, pen-drive. Se o banco cair, some ou a conta for
   perdida, o sistema é reconstruído a partir deste arquivo.

   Cada tabela é exportada dentro de try/catch: se uma falhar (ex.: tabela
   criada em runtime que ainda não existe), as demais continuam. O CPF e os
   dados bancários voltam DECIFRADOS pelo middleware do Prisma (nos modelos)
   e são omitidos das tabelas cruas por segurança do arquivo.
   ========================================================================= */

export type Backup = {
  geradoEm: string;
  origem: string;
  versao: number;
  tabelas: Record<string, unknown[]>;
  contagem: Record<string, number>;
  erros: string[];
};

// Modelos Prisma exportados (nome no arquivo -> função de leitura).
const MODELOS: Record<string, () => Promise<unknown[]>> = {
  usuarios: () => prisma.usuario.findMany(),
  efetivo: async () => protegerSensiveis(await prisma.efetivo.findMany()),
  equipesFerias: () => prisma.equipeFerias.findMany(),
  membrosFerias: () => prisma.membroFerias.findMany(),
  equipesLicencaPremio: () => prisma.equipeLicencaPremio.findMany(),
  membrosLicencaPremio: () => prisma.membroLicencaPremio.findMany(),
  config: () => prisma.config.findMany(),
  documentos: () => prisma.documento.findMany(),
  avisos: () => prisma.aviso.findMany(),
  cursos: () => prisma.curso.findMany(),
  cursoInscricoes: () => prisma.cursoInscricao.findMany(),
  auditoria: () => prisma.auditoria.findMany(),
  requerimentos: () => prisma.requerimento.findMany(),
  perfisRequerente: () => prisma.perfilRequerente.findMany(),
  pushSubscriptions: () => prisma.pushSubscription.findMany(),
};

// Tabelas criadas em runtime (raw SQL) — não têm modelo Prisma.
const TABELAS_RUNTIME = [
  "disciplinar_procedimento",
  "disciplinar_contador",
  "cc_acesso",
  "permuta_pedido",
  "permuta_contador",
  "auditoria_ancora",
];

// Campos que NÃO devem sair no arquivo de backup (segurança do arquivo).
const OMITIR = new Set(["senha", "senhaHash", "hashSenha", "password", "salt"]);

function limpar(rows: unknown[]): unknown[] {
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const k of Object.keys(o)) if (OMITIR.has(k)) delete o[k];
    return o;
  });
}

/* O Efetivo é lido já DECIFRADO (middleware do Prisma). Para o ARQUIVO de
   backup, re-ciframos CPF e dados bancários — assim o .json nunca carrega esses
   dados em texto puro. A restauração continua funcionando: os valores voltam no
   formato "enc:1:" (idempotente na gravação) e são decifrados na leitura. */
function protegerSensiveis(rows: unknown[]): unknown[] {
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const campo of CAMPOS_SENSIVEIS) {
      if (typeof o[campo] === "string" && o[campo]) o[campo] = cifrar(o[campo] as string);
    }
    return o;
  });
}

export async function gerarBackup(): Promise<Backup> {
  const tabelas: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};
  const erros: string[] = [];

  for (const [nome, ler] of Object.entries(MODELOS)) {
    try {
      const rows = limpar(await ler());
      tabelas[nome] = rows;
      contagem[nome] = rows.length;
    } catch (e) {
      erros.push(`${nome}: ${(e as Error).message}`);
    }
  }

  for (const t of TABELAS_RUNTIME) {
    try {
      const rows: unknown[] = await prisma.$queryRawUnsafe(`SELECT * FROM ${t}`);
      tabelas[t] = rows;
      contagem[t] = rows.length;
    } catch {
      // tabela ainda não criada em runtime — ignora silenciosamente
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    origem: "SIGEP-18º BPM",
    versao: 1,
    tabelas,
    contagem,
    erros,
  };
}
