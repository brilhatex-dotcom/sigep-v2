/* Coordenadas (lat, lng) das unidades do 18º BPM para o mapa do organograma.
   Chave = id do nó do organograma. Valores aproximados das sedes municipais
   no Maranhão. Ajuste fino se precisar. */
export const COORDS_UNIDADE: Record<string, { lat: number; lng: number }> = {
  // Sede
  "18bpm": { lat: -5.2919, lng: -44.4903 }, // Presidente Dutra
  // 2ª CIA
  "2cia-p1": { lat: -4.8656, lng: -44.3711 }, // Santo Antônio dos Lopes
  "2cia-p2": { lat: -4.8447, lng: -44.5539 }, // Governador Archer
  "2cia-p3": { lat: -4.7375, lng: -44.2814 }, // Capinzal do Norte
  // 3ª CIA
  "3cia-p1": { lat: -5.0322, lng: -44.4506 }, // Dom Pedro
  "3cia-p2": { lat: -5.3486, lng: -44.4744 }, // Gonçalves Dias
  "3cia-p3": { lat: -5.0611, lng: -44.6075 }, // São José dos Basílios
  "3cia-p4": { lat: -4.9989, lng: -44.7189 }, // Joselândia
  // 4ª CIA
  "4cia-p1": { lat: -5.5772, lng: -44.3853 }, // São Domingos do Maranhão
  "4cia-p2": { lat: -5.3033, lng: -44.0611 }, // Governador Luiz Rocha
  "4cia-p3": { lat: -5.5486, lng: -44.5069 }, // Santa Filomena do Maranhão
  // 5ª CIA
  "5cia-p1": { lat: -5.2839, lng: -44.6467 }, // Tuntum
  // 6ª CIA
  "6cia-p1": { lat: -5.3006, lng: -44.2789 }, // Governador Eugênio Barros
  "6cia-p2": { lat: -5.4211, lng: -44.0664 }, // Senador Alexandre Costa
  "6cia-p3": { lat: -5.7128, lng: -44.6019 }, // Graça Aranha
};
