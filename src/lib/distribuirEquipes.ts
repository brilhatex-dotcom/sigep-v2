import { ORGANOGRAMA, pertenceAoNo, acharNo, type NoOrg } from "@/lib/organograma";

/* DISTRIBUIÇÃO EQUILIBRADA DAS EQUIPES DE FÉRIAS

   Ao abrir o plano de um ano novo, copiar as mesmas equipes do ano anterior
   deixa o efetivo desequilibrado: se meia dúzia da ROTEM caiu toda na equipe 3,
   quando a equipe 3 sair de férias a ROTEM fica sem ninguém. O mesmo vale para
   os destacamentos do interior, que têm poucos militares cada.

   A regra aqui é: espalhar cada GRUPO (a unidade onde o militar serve) pelas
   equipes, de modo que cada equipe leve no máximo um punhado de cada grupo.
   Com a ROTEM tendo 9 militares e havendo 9 equipes, sai 1 por equipe — que é
   exatamente o "1 PM por vez de férias na ROTEM".

   A EQUIPE 1 é preservada: os militares que já estavam nela continuam nela.
   Ela entra no cálculo apenas como carga inicial, para que a distribuição das
   demais equipes compense o que a equipe 1 já levou de cada grupo. */

export type MilitarParaDistribuir = {
  idPmma: string;
  lotacao: string | null;
  // usados só para desempate estável (mesma ordem em toda execução)
  postoOrdem?: number;
  nome?: string | null;
};

export type Atribuicao = { idPmma: string; numeroEquipe: string };

/* Grupo do militar = o nó MAIS ESPECÍFICO do organograma a que ele pertence
   (o pelotão da cidade, e não a CIA inteira; a ROTEM, e não "Especializado").
   É a granularidade que importa: o desfalque acontece no destacamento, não na
   companhia como um todo. Quem não casa com nenhum nó vai para "—", e esse
   resto também é espalhado entre as equipes. */
export function grupoDoMilitar(lotacao: string | null): string {
  let achado = "—";

  const visitar = (no: NoOrg) => {
    if (!pertenceAoNo(lotacao, no)) return;
    // se algum filho também serve, o filho é mais específico: desce
    const filhos = no.filhos ?? [];
    for (const f of filhos) {
      if (pertenceAoNo(lotacao, f)) { visitar(f); return; }
    }
    if (no.chaves.length > 0) achado = no.id;
  };

  for (const no of ORGANOGRAMA.filhos ?? []) visitar(no);
  return achado;
}

/* Nome legível da unidade, para mostrar na tela (o grupo é um id interno:
   "3cia-p2" -> "2º Pel. Gonçalves Dias"). */
export function rotuloDoGrupo(grupo: string): string {
  if (grupo === "—") return "Sem lotação definida";
  return acharNo(grupo)?.rotulo ?? grupo;
}

/* Distribui os militares pelas equipes equilibrando por grupo.

   `fixos` são os que não se movem (a equipe 1 do ano anterior): entram no
   resultado como estão e pré-carregam a contagem das equipes.

   Para cada militar a distribuir, escolhe a equipe que:
     1º) tem MENOS gente do grupo dele  (evita esvaziar a unidade)
     2º) em caso de empate, tem MENOS gente no total  (equipes parelhas)
     3º) em caso de empate, a de menor número  (resultado determinístico) */
export function distribuirEquilibrado(
  militares: MilitarParaDistribuir[],
  equipes: string[],
  fixos: Atribuicao[] = []
): Atribuicao[] {
  if (!equipes.length) return [];

  const porGrupo = new Map<string, Map<string, number>>(); // grupo -> equipe -> qtd
  const totalPorEquipe = new Map<string, number>(equipes.map((e) => [e, 0]));

  const carga = (grupo: string, equipe: string) => porGrupo.get(grupo)?.get(equipe) ?? 0;
  const somar = (grupo: string, equipe: string) => {
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, new Map());
    const m = porGrupo.get(grupo)!;
    m.set(equipe, (m.get(equipe) ?? 0) + 1);
    totalPorEquipe.set(equipe, (totalPorEquipe.get(equipe) ?? 0) + 1);
  };

  // ---- 1) os fixos entram primeiro e pré-carregam as contagens ----
  const resultado: Atribuicao[] = [];
  const jaAtribuido = new Set<string>();
  const mapaLotacao = new Map(militares.map((m) => [m.idPmma, m.lotacao ?? null]));

  for (const f of fixos) {
    if (!equipes.includes(f.numeroEquipe)) continue;
    resultado.push(f);
    jaAtribuido.add(f.idPmma);
    somar(grupoDoMilitar(mapaLotacao.get(f.idPmma) ?? null), f.numeroEquipe);
  }

  // ---- 2) os demais, agrupados, do maior grupo para o menor ----
  // Grupos grandes primeiro dá um resultado melhor: quando sobra pouca folga,
  // quem já foi colocado foi o que mais precisa de espalhamento.
  const restantes = militares.filter((m) => !jaAtribuido.has(m.idPmma));
  const grupos = new Map<string, MilitarParaDistribuir[]>();
  for (const m of restantes) {
    const g = grupoDoMilitar(m.lotacao);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(m);
  }

  const ordemGrupos = Array.from(grupos.keys()).sort((a, b) => {
    const d = (grupos.get(b)!.length) - (grupos.get(a)!.length);
    return d !== 0 ? d : a.localeCompare(b);
  });

  // equipes que podem RECEBER gente nova: todas menos as que só têm fixos.
  // (a equipe 1 é preservada — não recebe redistribuídos)
  const equipesFixas = new Set(fixos.map((f) => f.numeroEquipe));
  const equipesDisponiveis = equipes.filter((e) => !equipesFixas.has(e));
  const alvo = equipesDisponiveis.length ? equipesDisponiveis : equipes;

  for (const g of ordemGrupos) {
    // ordem estável dentro do grupo: patente, depois nome
    const doGrupo = [...grupos.get(g)!].sort((a, b) => {
      const pa = a.postoOrdem ?? 99, pb = b.postoOrdem ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
    });

    for (const m of doGrupo) {
      let melhor = alvo[0];
      for (const e of alvo) {
        const cg = carga(g, e), cgM = carga(g, melhor);
        if (cg < cgM) { melhor = e; continue; }
        if (cg > cgM) continue;
        const te = totalPorEquipe.get(e) ?? 0, tm = totalPorEquipe.get(melhor) ?? 0;
        if (te < tm) { melhor = e; continue; }
        if (te > tm) continue;
        if (Number(e) < Number(melhor)) melhor = e;
      }
      resultado.push({ idPmma: m.idPmma, numeroEquipe: melhor });
      somar(g, melhor);
    }
  }

  return resultado;
}
