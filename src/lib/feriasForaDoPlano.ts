import { prisma } from "@/lib/prisma";
import { idsInativos, saidasComData } from "@/lib/inativos";
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

/* =========================================================================
   O CONTRÁRIO: quem está NO plano e não deveria contar — e quem precisa de
   atenção.

   O PLANO É PUBLICADO EM OUTUBRO do ano anterior (o de 2027 sai em outubro
   de 2026). Daí em diante ele vale como publicado: quem sair da unidade a
   partir de 1º de outubro CONTINUA no plano. Só conta como "saiu" — e não
   deveria estar no plano — quem saiu ANTES da publicação.

   - SAÍDOS: saíram da unidade antes de outubro do ano anterior e mesmo assim
     estão no plano (o rodízio copiava todo mundo do plano anterior).
   - DUAS FÉRIAS NO ANO: o mesmo militar em mais de uma equipe, ou numa equipe
     e também com férias avulsas no mesmo ano. Cada militar goza UMA férias
     por plano.
   - FÉRIAS ATRASADAS: quem adiou férias de exercícios anteriores. Só aviso:
     não entram de novo no plano automaticamente (seguem com uma férias no
     ano; as atrasadas o P/1 marca à parte).
   ========================================================================= */
export type ProblemaPlano = {
  id: string; postoGrad: string; nome: string; nomeGuerra: string;
  equipes: string[];          // equipes em que aparece neste ano
  avulsas?: string[];         // férias avulsas no mesmo ano ("dd/mm a dd/mm")
  dataSaida?: string;         // saídos: quando saiu
};
export type FeriasAtrasadas = { id: string; nome: string; exercicio: string; motivo: string; equipe: string | null };

// 1º de outubro do ano anterior: a publicação do plano
export const publicacaoDoPlano = (ano: string) => `${Number(ano) - 1}-10-01`;

/* Data da saída em "aaaa-mm-dd" (aceita também dd/mm/aaaa). Sem data: conta
   como antiga (antes da publicação). */
function isoSaida(d: string): string {
  const t = (d || "").trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return t.slice(0, 10) || "0000-00-00";
}

/* Quem saiu da unidade ANTES da publicação do plano do ano — é quem não
   deve ir (nem ficar) no plano. */
export async function saidosAntesDaPublicacao(ano: string): Promise<Map<string, string>> {
  const corte = publicacaoDoPlano(ano);
  const todas = await saidasComData();
  return new Map(Array.from(todas.entries()).filter(([, d]) => isoSaida(d) < corte));
}

const dm = (iso: string) => (iso || "").length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;

export async function problemasDoPlano(ano: string): Promise<{ saidos: ProblemaPlano[]; repetidos: ProblemaPlano[]; atrasadas: FeriasAtrasadas[] }> {
  const [membros, saidos, inativos, cfg] = await Promise.all([
    prisma.membroFerias.findMany({ where: { anoGozo: ano }, select: { idPmma: true, numeroEquipe: true } }),
    saidosAntesDaPublicacao(ano),
    idsInativos(),
    prisma.config.findMany({ where: { chave: { in: ["ferias_avulsas", "ferias_postergados"] } }, select: { chave: true, valor: true } }),
  ]);
  const json = (chave: string) => { try { const v = JSON.parse(cfg.find((c) => c.chave === chave)?.valor || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

  const porMilitar = new Map<string, string[]>();
  for (const m of membros) porMilitar.set(m.idPmma, [...(porMilitar.get(m.idPmma) || []), m.numeroEquipe]);

  // férias avulsas que começam neste ano, de quem também está numa equipe
  const avulsasDe = new Map<string, string[]>();
  for (const a of json("ferias_avulsas")) {
    const id = String(a?.idPmma || "");
    if (!id || !porMilitar.has(id) || String(a?.inicio || "").slice(0, 4) !== ano) continue;
    avulsasDe.set(id, [...(avulsasDe.get(id) || []), `${dm(a.inicio)} a ${dm(a.fim)}`]);
  }

  const idsSaidos = Array.from(porMilitar.keys()).filter((id) => saidos.has(id));
  const idsDuas = Array.from(porMilitar.keys()).filter((id) => !saidos.has(id) && (porMilitar.get(id)!.length > 1 || avulsasDe.has(id)));

  // adiaram férias de exercícios anteriores e seguem na unidade
  const atrasadasBrutas = json("ferias_postergados")
    .filter((p: any) => p?.idPmma && !inativos.has(String(p.idPmma)) && (!p.exercicio || String(p.exercicio) < ano));

  const ids = Array.from(new Set([...idsSaidos, ...idsDuas, ...atrasadasBrutas.map((p: any) => String(p.idPmma))]));
  if (!ids.length) return { saidos: [], repetidos: [], atrasadas: [] };
  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: ids } }, select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
  });
  const ficha = new Map(fichas.map((f) => [f.id, f]));
  const item = (id: string): ProblemaPlano => ({
    id,
    postoGrad: ficha.get(id)?.postoGrad || "",
    nome: ficha.get(id)?.nome || id,
    nomeGuerra: ficha.get(id)?.nomeGuerra || "",
    equipes: [...(porMilitar.get(id) || [])].sort((a, b) => Number(a) - Number(b)),
    avulsas: avulsasDe.get(id),
    dataSaida: saidos.get(id),
  });
  const ordem = (a: { postoGrad?: string; nome: string }, b: { postoGrad?: string; nome: string }) =>
    classificarPatente(a.postoGrad || "").ordem - classificarPatente(b.postoGrad || "").ordem || a.nome.localeCompare(b.nome, "pt-BR");

  const atrasadas: FeriasAtrasadas[] = atrasadasBrutas
    .map((p: any) => {
      const f = ficha.get(String(p.idPmma));
      return {
        id: String(p.idPmma),
        nome: `${f?.postoGrad || ""} ${f?.nome || p.nome || p.idPmma}`.trim(),
        exercicio: String(p.exercicio || ""),
        motivo: String(p.motivo || ""),
        equipe: porMilitar.get(String(p.idPmma))?.[0] ?? null,
        postoGrad: f?.postoGrad || "",
      };
    })
    .sort(ordem)
    .map(({ postoGrad: _p, ...resto }: any) => resto);

  return {
    saidos: idsSaidos.map(item).sort(ordem),
    repetidos: idsDuas.map(item).sort(ordem),
    atrasadas,
  };
}

/* Corrige o plano do ano. tipo "saidos": tira quem saiu da unidade antes da
   publicação; tipo "repetidos": deixa cada militar em UMA equipe só (a da
   primeira inclusão, a mais antiga). `ids` limita a quem foi indicado; sem
   ids, vale para todos daquele tipo. Férias avulsas não são apagadas aqui. */
export async function limparPlano(
  ano: string, tipo: "saidos" | "repetidos", ids?: string[],
): Promise<{ removidos: number; repetidosCorrigidos: number }> {
  const { saidos, repetidos } = await problemasDoPlano(ano);
  const tirar = tipo !== "saidos" ? [] : saidos.map((s) => s.id).filter((id) => !ids?.length || ids.includes(id));
  let removidos = 0;
  if (tirar.length) {
    removidos = (await prisma.membroFerias.deleteMany({ where: { anoGozo: ano, idPmma: { in: tirar } } })).count;
  }
  let repetidosCorrigidos = 0;
  for (const r of tipo === "repetidos" ? repetidos.filter((x) => x.equipes.length > 1) : []) {
    if (ids?.length && !ids.includes(r.id)) continue;
    const linhas = await prisma.membroFerias.findMany({ where: { anoGozo: ano, idPmma: r.id }, orderBy: { id: "asc" }, select: { id: true } });
    const sobram = linhas.slice(1).map((l) => l.id);
    if (sobram.length) {
      await prisma.membroFerias.deleteMany({ where: { id: { in: sobram } } });
      repetidosCorrigidos++;
    }
  }
  return { removidos, repetidosCorrigidos };
}
