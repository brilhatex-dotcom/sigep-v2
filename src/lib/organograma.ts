// ==========================================================
//  Organograma do 18º BPM — Memorando nº 116/2022
//
//  Regra do ADIDO: militar cuja lotacao contem "adido" pertence
//  SO a caixa Adidos, nunca a uma CIA (mesmo que a lotacao cite
//  a cidade, ex.: "ADIDO CMT SAO DOMINGOS"). Assim nao ha
//  contagem dupla e o topo soma o efetivo total.
// ==========================================================

export type NoOrg = {
  id: string;
  rotulo: string;
  cidade?: string;
  chaves: string[];
  filhos?: NoOrg[];
};

export const ORGANOGRAMA: NoOrg = {
  id: "18bpm",
  rotulo: "18º BPM",
  cidade: "Presidente Dutra - MA",
  chaves: [],
  filhos: [
    { id: "adm", rotulo: "ADM / Sede", cidade: "Presidente Dutra - MA", chaves: ["adm"] },
    { id: "adidos", rotulo: "Adidos", chaves: ["adido"] },
    {
      id: "especializado", rotulo: "Policiamento Especializado", chaves: ["especializado"],
      filhos: [
        { id: "ft", rotulo: "Força Tática", chaves: ["forca tatica", "ft"] },
        { id: "rotem", rotulo: "ROTEM", chaves: ["rotem"] },
      ],
    },
    { id: "1cia", rotulo: "1ª CIA", cidade: "Presidente Dutra - MA", chaves: ["1a cia", "1ª cia", "1 cia", "presidente dutra"] },
    {
      id: "2cia", rotulo: "2ª CIA", cidade: "Santo Antônio dos Lopes - MA",
      chaves: ["2a cia", "2ª cia", "santo antonio dos lopes"],
      filhos: [
        { id: "2cia-p1", rotulo: "1º Pel. Santo Antônio dos Lopes", cidade: "Santo Antônio dos Lopes - MA", chaves: ["santo antonio dos lopes"] },
        { id: "2cia-p2", rotulo: "2º Pel. Governador Archer", cidade: "Governador Archer - MA", chaves: ["archer"] },
        { id: "2cia-p3", rotulo: "3º Pel. Capinzal do Norte", cidade: "Capinzal do Norte - MA", chaves: ["capinzal"] },
      ],
    },
    {
      id: "3cia", rotulo: "3ª CIA", cidade: "Dom Pedro - MA",
      chaves: ["3a cia", "3ª cia", "dom pedro"],
      filhos: [
        { id: "3cia-p1", rotulo: "1º Pel. Dom Pedro", cidade: "Dom Pedro - MA", chaves: ["dom pedro"] },
        { id: "3cia-p2", rotulo: "2º Pel. Gonçalves Dias", cidade: "Gonçalves Dias - MA", chaves: ["goncalves dias"] },
        { id: "3cia-p3", rotulo: "3º Pel. São José dos Basílios", cidade: "São José dos Basílios - MA", chaves: ["basilios"] },
      ],
    },
    {
      id: "4cia", rotulo: "4ª CIA", cidade: "São Domingos do Maranhão - MA",
      chaves: ["4a cia", "4ª cia", "sao domingos"],
      filhos: [
        { id: "4cia-p1", rotulo: "1º Pel. São Domingos do Maranhão", cidade: "São Domingos do Maranhão - MA", chaves: ["sao domingos"] },
        { id: "4cia-p2", rotulo: "2º Pel. Governador Luiz Rocha", cidade: "Governador Luiz Rocha - MA", chaves: ["luiz rocha"] },
        { id: "4cia-p3", rotulo: "3º Pel. Santa Filomena do Maranhão", cidade: "Santa Filomena do Maranhão - MA", chaves: ["santa filomena"] },
      ],
    },
    {
      id: "5cia", rotulo: "5ª CIA", cidade: "Tuntum - MA",
      chaves: ["5a cia", "5ª cia", "tuntum"],
      filhos: [
        { id: "5cia-p1", rotulo: "1º Pel. Tuntum", cidade: "Tuntum - MA", chaves: ["tuntum"] },
        { id: "5cia-p2", rotulo: "2º Pel. Joselândia", cidade: "Joselândia - MA", chaves: ["joselandia"] },
      ],
    },
    {
      id: "6cia", rotulo: "6ª CIA", cidade: "Governador Eugênio Barros - MA",
      chaves: ["6a cia", "6ª cia", "eugenio barros"],
      filhos: [
        { id: "6cia-p1", rotulo: "1º Pel. Governador Eugênio Barros", cidade: "Governador Eugênio Barros - MA", chaves: ["eugenio barros"] },
        { id: "6cia-p2", rotulo: "2º Pel. Senador Alexandre Costa", cidade: "Senador Alexandre Costa - MA", chaves: ["alexandre costa"] },
        { id: "6cia-p3", rotulo: "3º Pel. Graça Aranha", cidade: "Graça Aranha - MA", chaves: ["graca aranha"] },
      ],
    },
  ],
};

function normaliza(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function ehAdido(lotacao: string | null): boolean {
  if (!lotacao) return false;
  return normaliza(lotacao).includes("adido");
}

function noEhAdidos(no: NoOrg): boolean {
  return no.chaves.some((c) => normaliza(c) === "adido");
}

// Pertence DIRETAMENTE a este no (sem olhar filhos)?
function pertenceDireto(lotacao: string | null, no: NoOrg): boolean {
  if (!lotacao || no.chaves.length === 0) return false;
  const adido = ehAdido(lotacao);
  const ehAdidos = noEhAdidos(no);
  if (adido) return ehAdidos;     // adido -> so na caixa Adidos
  if (ehAdidos) return false;     // nao-adido nunca em Adidos
  const l = normaliza(lotacao);
  return no.chaves.some((c) => l.includes(normaliza(c)));
}

// Pertence a este no OU a qualquer descendente (para contagem e listagem).
export function pertenceAoNo(lotacao: string | null, no: NoOrg): boolean {
  if (pertenceDireto(lotacao, no)) return true;
  for (const f of no.filhos ?? []) {
    if (pertenceAoNo(lotacao, f)) return true;
  }
  return false;
}

export function acharNo(id: string, raiz: NoOrg = ORGANOGRAMA): NoOrg | null {
  if (raiz.id === id) return raiz;
  for (const f of raiz.filhos ?? []) {
    const achou = acharNo(id, f);
    if (achou) return achou;
  }
  return null;
}
