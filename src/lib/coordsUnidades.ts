/* Coordenadas (lat, lng) e população aproximada (IBGE) das unidades do 18º BPM,
   para o mapa do organograma. Chave = id do nó do organograma. Coordenadas nas
   sedes municipais do Maranhão. População é estimativa — ajuste se precisar. */
export type CoordUnidade = { lat: number; lng: number; pop: number };

export const COORDS_UNIDADE: Record<string, CoordUnidade> = {
  // Sede
  "18bpm": { lat: -5.28944, lng: -44.48972, pop: 48072 }, // Presidente Dutra
  // 2ª CIA
  "2cia-p1": { lat: -4.86472, lng: -44.37139, pop: 13998 }, // Santo Antônio dos Lopes
  "2cia-p2": { lat: -4.84472, lng: -44.55389, pop: 10058 }, // Governador Archer
  "2cia-p3": { lat: -4.73528, lng: -44.28139, pop: 11224 }, // Capinzal do Norte
  // 3ª CIA
  "3cia-p1": { lat: -5.03306, lng: -44.45083, pop: 22902 }, // Dom Pedro
  "3cia-p2": { lat: -5.34194, lng: -44.47444, pop: 17093 }, // Gonçalves Dias
  "3cia-p3": { lat: -5.06111, lng: -44.60750, pop: 7930 },  // São José dos Basílios
  "3cia-p4": { lat: -4.99917, lng: -44.71861, pop: 14488 }, // Joselândia
  // 4ª CIA
  "4cia-p1": { lat: -5.57722, lng: -44.38528, pop: 34645 }, // São Domingos do Maranhão
  "4cia-p2": { lat: -5.30333, lng: -44.06111, pop: 6867 },  // Governador Luiz Rocha
  "4cia-p3": { lat: -5.54861, lng: -44.50694, pop: 6811 },  // Santa Filomena do Maranhão
  // 5ª CIA
  "5cia-p1": { lat: -5.28389, lng: -44.64667, pop: 42328 }, // Tuntum
  // 6ª CIA
  "6cia-p1": { lat: -5.39306, lng: -44.20111, pop: 14512 }, // Governador Eugênio Barros
  "6cia-p2": { lat: -5.42111, lng: -44.06639, pop: 9137 },  // Senador Alexandre Costa
  "6cia-p3": { lat: -5.71278, lng: -44.60194, pop: 6205 },  // Graça Aranha
};
