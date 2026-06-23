// ==========================================================
//  src/lib/efetivoMinimo.ts
//  Regra de efetivo minimo por unidade (pelotao/localidade).
//
//  - Pelotao-SEDE de Cia (a propria cidade-sede da Cia): minimo 8
//  - Pelotao DESTACADO (DPM em outra cidade):            minimo 7
//  - Sede do BPM, ADM, ROTEM, FT, Adidos, no "Cia" agregado
//    e o topo "18bpm": SEM alerta (minimo 0 = ignora)
//
//  "Disponivel" = militar cuja situacao calculada e "Pronto"
//  (ou seja: NAO esta de Ferias, JMS, LP, LTIP, Licenca,
//   Reserva ou qualquer outro afastamento).
// ==========================================================

import { NoOrg, pertenceAoNo } from "@/lib/organograma";

// Mapa de minimo por id de no do organograma.
// So os pelotoes/localidades que controlamos entram aqui.
// O que nao estiver no mapa NAO gera alerta.
export const MINIMO_POR_NO: Record<string, number> = {
  // --- Pelotoes-sede de Cia (minimo 8) ---
  "2cia-p1": 8, // Santo Antonio dos Lopes
  "3cia-p1": 8, // Dom Pedro
  "4cia-p1": 8, // Sao Domingos do Maranhao
  "5cia-p1": 8, // Tuntum
  "6cia-p1": 8, // Governador Eugenio Barros

  // --- Pelotoes destacados / DPM (minimo 7) ---
  "2cia-p2": 7, // Governador Archer
  "2cia-p3": 7, // Capinzal do Norte
  "3cia-p2": 7, // Goncalves Dias
  "3cia-p3": 7, // Sao Jose dos Basilios
  "3cia-p4": 7, // Joselandia
  "4cia-p2": 7, // Governador Luiz Rocha
  "4cia-p3": 7, // Santa Filomena do Maranhao
  "6cia-p2": 7, // Senador Alexandre Costa
  "6cia-p3": 7, // Graca Aranha
};

// Militar minimo necessario para a leitura da situacao.
export type MilEfetivo = {
  id: string;
  lotacao: string | null;
  situacao: string | null;
  jmsDataInicio?: string | null;
  jmsDataRetorno?: string | null;
};

// Resultado por unidade controlada.
export type StatusUnidade = {
  noId: string;
  rotulo: string;
  cidade?: string;
  minimo: number;
  efetivoTotal: number;     // todos lotados na unidade
  disponiveis: number;      // os que estao "Pronto"
  afastados: number;        // total - disponiveis
  faltam: number;           // quanto falta para atingir o minimo (0 se ok)
  critico: boolean;         // disponiveis < minimo
};

// Considera "disponivel" apenas quem esta Pronto.
function estaDisponivel(situacaoCalc: string): boolean {
  return situacaoCalc.trim().toLowerCase().includes("pronto");
}

// Acha um no pelo id dentro da arvore (busca recursiva simples).
function acharNoPorId(no: NoOrg, id: string): NoOrg | null {
  if (no.id === id) return no;
  for (const f of no.filhos ?? []) {
    const achou = acharNoPorId(f, id);
    if (achou) return achou;
  }
  return null;
}

// Calcula o status de TODAS as unidades controladas (as do MINIMO_POR_NO).
// Recebe a lista de militares ja com a SITUACAO CALCULADA pronta
// (campo `situacaoCalc`), para nao reimplementar a logica de ferias/JMS aqui.
export function calcularStatusUnidades(
  raiz: NoOrg,
  militares: (MilEfetivo & { situacaoCalc: string })[]
): StatusUnidade[] {
  const resultado: StatusUnidade[] = [];

  for (const [noId, minimo] of Object.entries(MINIMO_POR_NO)) {
    const no = acharNoPorId(raiz, noId);
    if (!no) continue;

    const naUnidade = militares.filter((m) => pertenceAoNo(m.lotacao, no));
    const efetivoTotal = naUnidade.length;
    const disponiveis = naUnidade.filter((m) => estaDisponivel(m.situacaoCalc)).length;
    const afastados = efetivoTotal - disponiveis;
    const faltam = Math.max(0, minimo - disponiveis);

    resultado.push({
      noId,
      rotulo: no.rotulo,
      cidade: no.cidade,
      minimo,
      efetivoTotal,
      disponiveis,
      afastados,
      faltam,
      critico: disponiveis < minimo,
    });
  }

  return resultado;
}

// Atalho: so as unidades em estado CRITICO (para o card de alerta).
export function unidadesCriticas(
  raiz: NoOrg,
  militares: (MilEfetivo & { situacaoCalc: string })[]
): StatusUnidade[] {
  return calcularStatusUnidades(raiz, militares).filter((u) => u.critico);
}

// Retorna um mapa noId -> minimo, util para o componente do organograma
// destacar visualmente os nos controlados.
export function mapaMinimos(): Record<string, number> {
  return { ...MINIMO_POR_NO };
}
