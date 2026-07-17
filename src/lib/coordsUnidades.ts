/* Coordenadas (lat, lng) e população aproximada das unidades do 18º BPM, para o
   mapa do organograma. Chave = id do nó do organograma. Coordenadas das sedes
   municipais conferidas em fontes oficiais (IBGE / Wikidata / cidadesdomeubrasil).
   População = estimativa IBGE (aprox.). */
export type CoordUnidade = { lat: number; lng: number; pop: number };

export const COORDS_UNIDADE: Record<string, CoordUnidade> = {
  // Sede — Presidente Dutra (IBGE 05°17'24"S 44°29'24"W)
  "18bpm": { lat: -5.2900, lng: -44.4900, pop: 47567 },
  // 2ª CIA
  "2cia-p1": { lat: -4.8661, lng: -44.3653, pop: 13998 }, // Santo Antônio dos Lopes
  "2cia-p2": { lat: -5.0219, lng: -44.2708, pop: 10886 }, // Governador Archer (5°01'19"S 44°16'15"W)
  "2cia-p3": { lat: -4.7278, lng: -44.3269, pop: 11224 }, // Capinzal do Norte (4°43'40"S 44°19'37"W)
  // 3ª CIA
  "3cia-p1": { lat: -5.0328, lng: -44.4358, pop: 22902 }, // Dom Pedro (5°01'58"S 44°26'09"W)
  "3cia-p2": { lat: -5.1475, lng: -44.3013, pop: 17934 }, // Gonçalves Dias (5°09'03"S 44°17'56"W)
  "3cia-p3": { lat: -5.0549, lng: -44.5809, pop: 7930 },  // São José dos Basílios
  "3cia-p4": { lat: -4.9861, lng: -44.6958, pop: 16136 }, // Joselândia
  // 4ª CIA
  "4cia-p1": { lat: -5.5758, lng: -44.3853, pop: 34645 }, // São Domingos do Maranhão (5°34'33"S 44°23'07"W)
  "4cia-p2": { lat: -5.5014, lng: -44.0686, pop: 6867 },  // Governador Luiz Rocha (5°30'05"S 44°04'07"W)
  "4cia-p3": { lat: -5.4967, lng: -44.5638, pop: 6811 },  // Santa Filomena do Maranhão
  // 5ª CIA
  "5cia-p1": { lat: -5.2548, lng: -44.6444, pop: 42328 }, // Tuntum
  // 6ª CIA
  "6cia-p1": { lat: -5.3231, lng: -44.2467, pop: 14512 }, // Governador Eugênio Barros (5°19'23"S 44°14'48"W)
  "6cia-p2": { lat: -5.2510, lng: -44.0533, pop: 9137 },  // Senador Alexandre Costa
  "6cia-p3": { lat: -5.4094, lng: -44.3342, pop: 6205 },  // Graça Aranha (5°24'34"S 44°20'03"W)
};
