import { prisma } from "@/lib/prisma";

/* =========================================================================
   MOTIVO DA SUSTAÇÃO DAS FÉRIAS, por equipe e ano.

   Equipe com 2º período é equipe cujas férias foram SUSTADAS: o policial
   volta antes, por necessidade do serviço (eleição, São João...), e goza os
   dias restantes depois. O memorando dessas equipes diz isso por extenso —
   "devendo apresentar-se por necessidade do serviço policial militar, em
   decorrência do período eleitoral, no dia ..." — e o motivo muda de equipe
   para equipe.

   Fica na tabela Config, num mapa { "<ano>|<equipe>": texto }, e não numa
   coluna da equipes_ferias: o deploy não roda `db push`.
   ========================================================================= */

const CHAVE = "ferias_sustacao_motivo";
const chave = (ano: string, equipe: string) => `${String(ano).trim()}|${String(equipe).trim()}`;

export async function motivosSustacao(): Promise<Record<string, string>> {
  try {
    const row = await prisma.config.findUnique({ where: { chave: CHAVE }, select: { valor: true } });
    const o = row?.valor ? JSON.parse(row.valor) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

export const motivoDe = (mapa: Record<string, string>, ano: string, equipe: string) => mapa[chave(ano, equipe)] || "";

// texto vazio apaga
export async function gravarMotivoSustacao(ano: string, equipe: string, texto: string | null | undefined): Promise<void> {
  const mapa = await motivosSustacao();
  const t = String(texto || "").trim().replace(/^,\s*/, "").replace(/[.,;\s]+$/, "").slice(0, 200);
  const k = chave(ano, equipe);
  if ((mapa[k] || "") === t) return;
  if (t) mapa[k] = t; else delete mapa[k];
  await prisma.config.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify(mapa) },
    create: { chave: CHAVE, valor: JSON.stringify(mapa), descricao: "Motivo da sustação de férias por equipe (sai no memorando)" },
    select: { chave: true },
  });
}
