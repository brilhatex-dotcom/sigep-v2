import { prisma } from "@/lib/prisma";

/* =========================================================================
   APRESENTAÇÃO DA TROPA de cada JOE ("22H NA SEDE DO 18º BPM").

   Preenchida no JOE, vai sozinha para o campo APRESENTAÇÃO da escala da JOE
   (que continua editável lá).

   Fica na tabela Config, num mapa { idDoJoe: texto }, e não numa coluna nova
   da tabela joe: o deploy não roda `db push`, e uma coluna declarada só no
   schema.prisma não existiria em produção — o Prisma passaria a pedir uma
   coluna que o banco não tem e TODA leitura de JOE quebraria.
   ========================================================================= */

const CHAVE = "joe_apresentacao";

export async function apresentacoesJoe(): Promise<Record<string, string>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE }, select: { valor: true } });
    const o = row?.valor ? JSON.parse(row.valor) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

// texto vazio apaga
export async function gravarApresentacaoJoe(id: string, texto: string | null | undefined): Promise<string> {
  const mapa = await apresentacoesJoe();
  const t = String(texto || "").trim().slice(0, 200);
  if (t) mapa[id] = t; else delete mapa[id];
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(mapa) },
    create: { chave: CHAVE, valor: JSON.stringify(mapa), descricao: "Apresentação da tropa por JOE (vai para a escala da JOE)" },
    select: { chave: true },
  });
  return t;
}
