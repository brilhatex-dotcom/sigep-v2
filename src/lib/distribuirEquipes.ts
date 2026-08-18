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

/* ================= RODÍZIO ANUAL DAS EQUIPES =================

   Regra do Batalhão: de um ano para o outro, cada equipe DESCE um número, e a
   primeira do rodízio dá a volta para a última.

     equipe 1  — fica de fora, sempre a mesma gente
     equipe 2  ->  9        equipe 6  ->  5
     equipe 3  ->  2        equipe 7  ->  6
     equipe 4  ->  3        equipe 8  ->  7
     equipe 5  ->  4        equipe 9  ->  8

   O porquê: cada equipe tem o seu período no calendário. Quem saiu de férias
   no período da equipe 2 neste ano sai no da 9 no ano que vem — assim todo
   mundo reveza a época do ano, em vez de ficar sempre com o mesmo mês. */
export function mapaRodizio(equipes: string[]): Map<string, string> {
  const ordenadas = [...equipes].sort((a, b) => Number(a) - Number(b));
  const mapa = new Map<string, string>();
  if (ordenadas.length < 2) return mapa;

  const [primeira, ...rotativas] = ordenadas;
  mapa.set(primeira, primeira); // a equipe 1 não roda

  const k = rotativas.length;
  rotativas.forEach((eq, i) => {
    // desce um: a de índice 0 (equipe 2) dá a volta para a última (equipe 9)
    mapa.set(eq, rotativas[(i - 1 + k) % k]);
  });
  return mapa;
}

/* Aplica o rodízio e, em seguida, corrige APENAS o que ficou desequilibrado.

   O rodízio sozinho preserva a composição das equipes (só troca o rótulo), o
   que é ótimo quando o ano de origem já estava equilibrado — nesse caso não há
   nada a corrigir e todo mundo mantém o rodízio limpo.

   Quando o ano de origem tem uma unidade concentrada numa equipe só, o rodízio
   herdaria essa concentração. Então, depois de rodar, movemos o MÍNIMO de
   militares necessário para que nenhuma equipe fique acima do teto daquela
   unidade — preservando o rodízio de todos os demais. */
export function rotacionarComEquilibrio(
  militares: MilitarParaDistribuir[],
  equipes: string[],
  atribuicoesOrigem: Atribuicao[]
): { atribuicoes: Atribuicao[]; movidosPorEquilibrio: number } {
  const ordenadas = [...equipes].sort((a, b) => Number(a) - Number(b));
  if (ordenadas.length < 2) {
    return { atribuicoes: atribuicoesOrigem, movidosPorEquilibrio: 0 };
  }
  const primeira = ordenadas[0];
  const rotativas = ordenadas.slice(1);
  const mapa = mapaRodizio(ordenadas);
  const mapaLotacao = new Map(militares.map((m) => [m.idPmma, m.lotacao ?? null]));

  // ---- 1) rodízio puro ----
  const destino = new Map<string, string>(); // idPmma -> equipe
  for (const a of atribuicoesOrigem) {
    destino.set(a.idPmma, mapa.get(a.numeroEquipe) ?? a.numeroEquipe);
  }

  // ---- 2) correção mínima do equilíbrio, unidade por unidade ----
  // Só mexe em quem está nas equipes do rodízio: a equipe 1 é intocada.
  const porGrupo = new Map<string, string[]>(); // grupo -> ids (fora da equipe 1)
  for (const [id, eq] of destino) {
    if (eq === primeira) continue;
    const g = grupoDoMilitar(mapaLotacao.get(id) ?? null);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g)!.push(id);
  }

  let movidos = 0;
  const gruposOrdenados = Array.from(porGrupo.keys()).sort();

  for (const g of gruposOrdenados) {
    const ids = porGrupo.get(g)!;
    const teto = Math.ceil(ids.length / rotativas.length);

    // quantos deste grupo em cada equipe do rodízio
    const contar = () => {
      const c = new Map<string, string[]>(rotativas.map((e) => [e, []]));
      for (const id of ids) {
        const eq = destino.get(id)!;
        if (c.has(eq)) c.get(eq)!.push(id);
      }
      return c;
    };

    // enquanto alguma equipe passar do teto, tira um e põe na mais vazia
    for (let volta = 0; volta < ids.length; volta++) {
      const c = contar();
      let cheia = "", vazia = "";
      for (const e of rotativas) {
        if (!cheia || c.get(e)!.length > c.get(cheia)!.length) cheia = e;
        if (!vazia || c.get(e)!.length < c.get(vazia)!.length) vazia = e;
      }
      if (c.get(cheia)!.length <= teto) break;             // já está no teto
      if (c.get(cheia)!.length - c.get(vazia)!.length < 2) break; // nada a ganhar

      // move sempre o mesmo (ordem estável) para o resultado ser repetível
      const candidato = [...c.get(cheia)!].sort()[0];
      destino.set(candidato, vazia);
      movidos++;
    }
  }

  return {
    atribuicoes: Array.from(destino.entries()).map(([idPmma, numeroEquipe]) => ({ idPmma, numeroEquipe })),
    movidosPorEquilibrio: movidos,
  };
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
