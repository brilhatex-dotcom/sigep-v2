import { prisma } from "@/lib/prisma";
import { idsInativos } from "@/lib/inativos";
import { grupoDoMilitar, rotuloDoGrupo } from "@/lib/distribuirEquipes";
import { classificarPatente } from "@/lib/patentes";
import { paraData } from "@/lib/ferias";

/* =========================================================================
   MILITARES FORA DO PLANO DE FÉRIAS — e a inclusão automática deles.

   O plano de um ano novo nasce do plano do ano anterior (rodízio). Quem
   chegou à unidade depois e nunca foi posto numa equipe ficava de fora sem
   ninguém perceber. Aqui:

   - `foraDoPlano(ano)`: militares ATIVOS (fora os que saíram da unidade —
     lib/inativos) que não estão em nenhuma equipe daquele ano, cada um já com
     a equipe sugerida;
   - `incluirNoPlano(ano, ids?)`: põe esses militares nas equipes sugeridas.

   A equipe sugerida segue o mesmo critério do Reequilibrar
   (lib/distribuirEquipes):
     1º) a equipe com MENOS gente da unidade do militar (não esvazia o
         destacamento quando a equipe sair);
     2º) empate: a equipe com menos gente no total;
     3º) empate: a de menor número.
   A EQUIPE 1 não recebe ninguém (é a equipe que o rodízio preserva), e
   equipe cujas férias já começaram também não, enquanto houver outra — não
   faz sentido incluir alguém numa férias que já passou.

   ADIDOS (lotação com "adido") aparecem na lista, marcados, mas NUNCA entram
   sozinhos: as férias deles são da unidade de origem. Só entram se o P/1
   incluir um a um.

   Cada militar vem com a equipe dele no plano do ANO ANTERIOR (ou a marca de
   que não estava nele): é o que explica por que alguém "antigo" ficou de
   fora — o plano novo só herda quem estava no plano do ano anterior.
   ========================================================================= */

export type ForaDoPlano = {
  id: string;
  postoGrad: string;
  nome: string;
  nomeGuerra: string;
  lotacao: string;
  unidade: string;          // rótulo legível do grupo (organograma)
  equipeSugerida: string;
  adido: boolean;           // lotação de adido: não entra automaticamente
  equipeAnoAnterior: string | null;  // equipe no plano de (ano - 1); null = não estava
};

const ehAdido = (lotacao: string | null) =>
  (lotacao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("adido");

type Equipe = { numeroEquipe: string; periodo1Inicio: string | null };

function hoje0(): Date {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Equipe para cada militar novo, considerando quem já está no plano. */
function sugerir(
  novos: { id: string; lotacao: string | null; postoOrdem: number; nome: string }[],
  atuais: { idPmma: string; numeroEquipe: string; lotacao: string | null }[],
  equipes: Equipe[],
): Map<string, string> {
  const numeros = equipes.map((e) => e.numeroEquipe).sort((a, b) => Number(a) - Number(b));
  const h = hoje0();
  const naoComecou = (e: Equipe) => {
    const ini = paraData(e.periodo1Inicio);
    return !ini || ini > h;
  };
  const semUm = numeros.filter((n) => n !== "1");
  const futuras = semUm.filter((n) => naoComecou(equipes.find((e) => e.numeroEquipe === n)!));
  const alvo = futuras.length ? futuras : semUm.length ? semUm : numeros;

  const porGrupo = new Map<string, Map<string, number>>();
  const total = new Map<string, number>(numeros.map((n) => [n, 0]));
  const somar = (g: string, eq: string) => {
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const m = porGrupo.get(g)!;
    m.set(eq, (m.get(eq) ?? 0) + 1);
    total.set(eq, (total.get(eq) ?? 0) + 1);
  };
  const carga = (g: string, eq: string) => porGrupo.get(g)?.get(eq) ?? 0;
  for (const a of atuais) somar(grupoDoMilitar(a.lotacao), a.numeroEquipe);

  // ordem estável: patente, depois nome
  const ordem = [...novos].sort((a, b) => a.postoOrdem - b.postoOrdem || a.nome.localeCompare(b.nome, "pt-BR"));
  const saida = new Map<string, string>();
  for (const m of ordem) {
    const g = grupoDoMilitar(m.lotacao);
    let melhor = alvo[0];
    for (const e of alvo) {
      const ce = carga(g, e), cm = carga(g, melhor);
      if (ce !== cm) { if (ce < cm) melhor = e; continue; }
      const te = total.get(e) ?? 0, tm = total.get(melhor) ?? 0;
      if (te !== tm) { if (te < tm) melhor = e; continue; }
      if (Number(e) < Number(melhor)) melhor = e;
    }
    saida.set(m.id, melhor);
    somar(g, melhor);
  }
  return saida;
}

export async function foraDoPlano(ano: string): Promise<ForaDoPlano[]> {
  const equipes = await prisma.equipeFerias.findMany({
    where: { anoGozo: ano }, select: { numeroEquipe: true, periodo1Inicio: true },
  });
  if (!equipes.length) return [];

  const [membros, anterior, inativos, fichas] = await Promise.all([
    prisma.membroFerias.findMany({ where: { anoGozo: ano }, select: { idPmma: true, numeroEquipe: true } }),
    prisma.membroFerias.findMany({ where: { anoGozo: String(Number(ano) - 1) }, select: { idPmma: true, numeroEquipe: true } }),
    idsInativos(),
    prisma.efetivo.findMany({ select: { id: true, postoGrad: true, nome: true, nomeGuerra: true, lotacao: true } }),
  ]);
  const noPlano = new Set(membros.map((m) => m.idPmma));
  const equipeAntes = new Map(anterior.map((m) => [m.idPmma, m.numeroEquipe]));
  const lotacaoDe = new Map(fichas.map((f) => [f.id, f.lotacao]));
  // ficha sem nome nem posto é registro incompleto/teste — não é militar a escalar
  const fora = fichas.filter((f) => !noPlano.has(f.id) && !inativos.has(f.id) && (f.nome || f.postoGrad));
  if (!fora.length) return [];

  const sugestao = sugerir(
    fora.map((f) => ({ id: f.id, lotacao: f.lotacao, postoOrdem: classificarPatente(f.postoGrad).ordem, nome: f.nome || "" })),
    membros.map((m) => ({ ...m, lotacao: lotacaoDe.get(m.idPmma) ?? null })),
    equipes,
  );

  return fora
    .map((f) => ({
      id: f.id,
      postoGrad: f.postoGrad || "",
      nome: f.nome || "",
      nomeGuerra: f.nomeGuerra || "",
      lotacao: f.lotacao || "",
      unidade: rotuloDoGrupo(grupoDoMilitar(f.lotacao)),
      equipeSugerida: sugestao.get(f.id) || "",
      adido: ehAdido(f.lotacao),
      equipeAnoAnterior: equipeAntes.get(f.id) ?? null,
    }))
    // adidos por último; dentro de cada parte, hierarquia
    .sort((a, b) => Number(a.adido) - Number(b.adido)
      || classificarPatente(a.postoGrad).ordem - classificarPatente(b.postoGrad).ordem
      || a.nome.localeCompare(b.nome, "pt-BR"));
}

/* Inclui no plano do ano os militares fora dele (todos — menos os adidos —,
   ou só `ids`), cada um na equipe sugerida. Devolve quem entrou e onde. */
export async function incluirNoPlano(ano: string, ids?: string[]): Promise<{ idPmma: string; numeroEquipe: string }[]> {
  const fora = await foraDoPlano(ano);
  const alvo = ids && ids.length ? fora.filter((f) => ids.includes(f.id)) : fora.filter((f) => !f.adido);
  const entram = alvo.filter((f) => f.equipeSugerida).map((f) => ({ idPmma: f.id, numeroEquipe: f.equipeSugerida }));
  if (!entram.length) return [];
  await prisma.membroFerias.createMany({
    data: entram.map((e) => ({ ...e, anoGozo: ano, dataCadastro: new Date().toISOString() })),
    skipDuplicates: true,
  });
  // a ficha mostra a equipe atual, como faz a inclusão manual (/api/ferias/membros)
  for (const e of entram) {
    try { await prisma.efetivo.update({ where: { id: e.idPmma }, data: { equipeFerias: e.numeroEquipe }, select: { id: true } }); } catch { /* ficha some: segue */ }
  }
  return entram;
}

/* O plano do PRÓXIMO exercício já aberto (ano de gozo maior que o atual), se
   houver — é nele que o militar recém-cadastrado entra sozinho. */
export async function anoDoProximoPlano(): Promise<string | null> {
  const anoAtual = hoje0().getFullYear();
  const linhas = await prisma.equipeFerias.findMany({ select: { anoGozo: true }, distinct: ["anoGozo"] });
  const futuros = linhas.map((l) => l.anoGozo).filter((a) => /^\d{4}$/.test(a) && Number(a) > anoAtual).sort();
  return futuros[0] ?? null;
}
