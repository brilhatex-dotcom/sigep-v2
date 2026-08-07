import { classificarPatente } from "@/lib/patentes";
import { paraData } from "@/lib/ferias";

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
};
export type AvulsaFila = { id: string; ancora: string };

export type Fila = {
  militares: Record<string, number>; // idPmma -> numero do memorando
  avulsas: Record<string, number>; // id da avulsa -> numero do memorando
  ultimo: number; // ultimo numero usado no ano; a LP continua em ultimo + 1
};

// Mesma ordem da tela do plano: patente, depois nome. Precisa bater, senao os
// militares do plano trocariam de numero.
function ordenar(lista: MembroFila[]): MembroFila[] {
  return [...lista].sort((a, b) => {
    const pa = classificarPatente(a.postoGrad).ordem;
    const pb = classificarPatente(b.postoGrad).ordem;
    if (pa !== pb) return pa - pb;
    return (a.nome ?? "").localeCompare(b.nome ?? "");
  });
}

export function montarFila(
  equipes: EquipeFila[],
  membros: MembroFila[],
  avulsas: AvulsaFila[]
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
    for (const m of ordenar(membros.filter((x) => x.numeroEquipe === e.numeroEquipe))) {
      militares[m.idPmma] = ++seq;
    }
    for (const a of baldes.get(i) ?? []) numAvulsas[a.id] = ++seq;
  });

  // Rede de seguranca: membro cuja equipe nao existe mais na tabela de equipes
  // continua contando para a base da LP, como contava antes.
  for (const m of ordenar(membros.filter((x) => militares[x.idPmma] === undefined))) {
    militares[m.idPmma] = ++seq;
  }

  return { militares, avulsas: numAvulsas, ultimo: seq };
}
