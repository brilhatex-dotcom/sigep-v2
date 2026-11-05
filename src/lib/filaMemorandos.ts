import { classificarPatente } from "@/lib/patentes";
import { paraData } from "@/lib/ferias";
import { compararAntiguidade, type ParaAntiguidade } from "@/lib/antiguidade";

/* FILA UNICA DOS MEMORANDOS DE FERIAS (logica pura, sem banco)

   Uma unica serie por ano, na ordem cronologica do plano:

     equipe 1 (001..044) · avulsos gerados no periodo da equipe 1 · equipe 2 · ...

   e a Licenca-Premio continua a partir do ultimo numero (`ultimo` + 1).

   O avulso NAO tem serie propria: entra na fila logo depois da equipe que
   estava de ferias na data em que foi cadastrado, e as equipes seguintes sobem
   um numero. Como o avulso sempre cai DEPOIS do que ja foi impresso, as equipes
   que ja sairam de ferias nao mudam de numero.

   Nada e gravado: o numero e derivado da posicao na fila, do mesmo jeito que o
   plano por equipes ja funcionava. Assim nunca existem dois memorandos com o
   mesmo numero. */

export type EquipeFila = { numeroEquipe: string; periodo1Inicio: string | null };
export type MembroFila = {
  idPmma: string;
  numeroEquipe: string;
  postoGrad: string | null;
  nome: string | null;
  dataPromocao?: string | null;
  numeroBarra?: string | null;
};
export type AvulsaFila = { id: string; ancora: string };

export type Fila = {
  militares: Record<string, number>; // idPmma -> numero do memorando
  avulsas: Record<string, number>; // id da avulsa -> numero do memorando
  ultimo: number; // ultimo numero usado no ano; a LP continua em ultimo + 1
};

/* A ORDEM DENTRO DA EQUIPE — e o número do memorando sai dela, por isso a
   tela do plano (e a da licença-prêmio) usa ESTA mesma função.

   A partir do plano de 2027: hierarquia completa (posto, data da promoção,
   barra), o princípio do P/1 para tudo o que o sistema lista. Até 2026 fica
   como foi impresso (posto, depois nome): mudar agora renumeraria memorandos
   já entregues. */
export const ANO_ORDEM_HIERARQUIA = 2027;
export function compararNoPlano(ano: string | number): (a: ParaAntiguidade, b: ParaAntiguidade) => number {
  if (Number(ano) >= ANO_ORDEM_HIERARQUIA) return compararAntiguidade;
  return (a, b) => {
    const pa = classificarPatente(a.postoGrad ?? null).ordem;
    const pb = classificarPatente(b.postoGrad ?? null).ordem;
    if (pa !== pb) return pa - pb;
    return (a.nome ?? "").localeCompare(b.nome ?? "");
  };
}

function ordenar(lista: MembroFila[], ano: string): MembroFila[] {
  return [...lista].sort(compararNoPlano(ano));
}

export function montarFila(
  equipes: EquipeFila[],
  membros: MembroFila[],
  avulsas: AvulsaFila[],
  ano = "",
): Fila {
  const equipesOrdenadas = [...equipes].sort(
    (a, b) => Number(a.numeroEquipe) - Number(b.numeroEquipe)
  );
  const inicioEquipe = equipesOrdenadas.map((e) => paraData(e.periodo1Inicio));

  // Cada avulsa cai no "balde" da ultima equipe cujas ferias ja tinham comecado
  // na data de ancora. Avulsa anterior a 1a equipe cai no balde -1 e abre a
  // numeracao do ano.
  const baldes = new Map<number, AvulsaFila[]>();
  const ordenadas = [...avulsas].sort(
    (a, b) => a.ancora.localeCompare(b.ancora) || a.id.localeCompare(b.id)
  );
  for (const a of ordenadas) {
    const d = paraData(a.ancora);
    let idx = -1;
    if (d) {
      for (let i = 0; i < inicioEquipe.length; i++) {
        const ini = inicioEquipe[i];
        if (ini && ini <= d) idx = i;
      }
    }
    const lista = baldes.get(idx) ?? [];
    lista.push(a);
    baldes.set(idx, lista);
  }

  const militares: Record<string, number> = {};
  const numAvulsas: Record<string, number> = {};
  let seq = 0;

  for (const a of baldes.get(-1) ?? []) numAvulsas[a.id] = ++seq;
  equipesOrdenadas.forEach((e, i) => {
    for (const m of ordenar(membros.filter((x) => x.numeroEquipe === e.numeroEquipe), ano)) {
      militares[m.idPmma] = ++seq;
    }
    for (const a of baldes.get(i) ?? []) numAvulsas[a.id] = ++seq;
  });

  // Rede de seguranca: membro cuja equipe nao existe mais na tabela de equipes
  // continua contando para a base da LP, como contava antes.
  for (const m of ordenar(membros.filter((x) => militares[x.idPmma] === undefined), ano)) {
    militares[m.idPmma] = ++seq;
  }

  return { militares, avulsas: numAvulsas, ultimo: seq };
}
