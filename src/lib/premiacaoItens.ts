import {
  TIPO_ASSINATURA, listarPecunia, podeVer, refAssinatura,
} from "@/lib/requerimentoPecunia";
import { refsAssinadas } from "@/lib/assinaturaSigep";

/* =========================================================================
   A PREMIAÇÃO PECUNIÁRIA COMO LINHA DA LISTA DE REQUERIMENTOS

   Ela morava num bloco próprio, em cima da tela. Funcionava com três; com
   quarenta viraria uma parede empurrando a lista de verdade para baixo da
   dobra. Quem procura um requerimento procura pelo MÊS — e a premiação tem
   data como qualquer outro pedido.

   Então aqui ela é traduzida para o formato da lista comum, e daí em diante
   segue o caminho de todos: agrupa por mês, recolhe, filtra por aba, entra na
   busca. O que ela não abre mão é do selo próprio, porque o ciclo é outro:
   aqui dentro ela é ASSINADA, e "deferido/indeferido" é decisão da SSP, que o
   sistema não acompanha.
   ========================================================================= */

export type ItemPecunia = {
  id: string;
  modalidade: string;
  modelo: string;
  status: string;
  criadoEm: string;
  requerente: string;
  href: string;
  sub: string;
  pecunia: true;
  podeExcluir: boolean;
};

export async function itensPremiacao(
  login: string, meuId: string, admin: boolean,
): Promise<ItemPecunia[]> {
  try {
    const todos = (await listarPecunia(200)).filter((r) => podeVer(r, login, meuId || null, admin));
    if (!todos.length) return [];

    /* Todas as assinaturas de todos os requerimentos numa consulta só: sem
       isto seria uma ida ao banco por documento, e esta tela abre o tempo
       todo. */
    const pares: string[] = [];
    for (const r of todos) for (const l of r.dados.linhas) {
      if (l.efetivoId) pares.push(refAssinatura(r.id, l.efetivoId));
    }
    const assinadas = await refsAssinadas(TIPO_ASSINATURA, pares);

    return todos.map((r) => {
      const doEfetivo = r.dados.linhas.filter((l) => l.efetivoId);
      /* Resolvido = assinou no SIGEP, ou marcou que assina pelo Gov.br (aí o
         espaço sai em branco de propósito). Nos dois casos não falta mais
         nada daquela pessoa. */
      const resolvida = (l: (typeof doEfetivo)[number]) =>
        assinadas.has(refAssinatura(r.id, l.efetivoId)) || !!l.assinarGov;

      const minha = meuId ? doEfetivo.find((l) => l.efetivoId === meuId) : undefined;
      const status =
        minha && !resolvida(minha) ? "pecunia_falta_voce"
        : doEfetivo.some((l) => !resolvida(l)) ? "pecunia_assinando"
        : "pecunia_pronto";

      const nomes = r.dados.linhas.map((l) => l.nome).filter(Boolean);
      return {
        id: r.id,
        modalidade: "PREMIAÇÃO PECUNIÁRIA",
        modelo: "",
        status,
        criadoEm: r.criadoEm,
        /* Os nomes de TODOS os requerentes: o pedido é coletivo, e é assim que
           a busca da tela acha o requerimento pelo nome de quem está nele. */
        requerente: nomes.join(", "),
        href: `/requerimentos/premiacao?id=${encodeURIComponent(r.id)}`,
        sub: `${r.id} · ${doEfetivo.length || r.dados.linhas.length} policial(is)`
          + (r.criadoPorNome ? ` · montado por ${r.criadoPorNome}` : ""),
        pecunia: true as const,
        podeExcluir: admin || (!!login && r.criadoPor === login),
      };
    });
  } catch {
    // tabela ainda não criada, ou banco fora: a lista comum não pode sumir
    return [];
  }
}
