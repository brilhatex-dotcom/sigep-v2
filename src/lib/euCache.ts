/* Cache, na memória da aba, da resposta de /api/eu (avatar e nome do
   cabeçalho). O AppShell é montado DENTRO de cada tela, então remontava a
   cada clique e buscava /api/eu de novo em toda navegação. Quem muda a foto
   chama esquecerEu() para a próxima tela buscar o dado novo. */

export type DadosEu = {
  efetivoId?: string | null;
  temFoto?: boolean;
  fotoH?: string | null;
  nomeExibicao?: string;
  lugar?: { noId: string; rotulo: string } | null;
};

const VALIDADE_MS = 5 * 60_000;
let cache: { usuario: string; em: number; dados: DadosEu } | null = null;

/** Dados guardados deste usuário (mesmo vencidos: servem para mostrar já). */
export function euGuardado(usuario: string): { dados: DadosEu; vencido: boolean } | null {
  if (!cache || cache.usuario !== usuario) return null;
  return { dados: cache.dados, vencido: Date.now() - cache.em > VALIDADE_MS };
}

export function guardarEu(usuario: string, dados: DadosEu) {
  cache = { usuario, em: Date.now(), dados };
}

export function esquecerEu() {
  cache = null;
}
