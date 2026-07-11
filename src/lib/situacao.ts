// ==========================================================
//  Situacao calculada (Opcao A: so mostra, nao altera o banco)
//
//  Prioridade:
//   1) Esta de ferias HOJE (pelo plano)         -> "Férias"
//   2) Esta em JMS HOJE (pelas datas)            -> "JMS"
//   3) Esta em Licenca-Premio HOJE (pelo plano)  -> "Licença-Prêmio"
//   4) Caso contrario                            -> situacao da ficha
//
//  Uso: montar o conjunto de IDs em ferias (1x, no servidor) e
//  chamar situacaoCalculada(militar, idsEmFerias, hoje) por linha.
//  O 4o parametro (idsEmLicencaPremio) e opcional: telas que ainda
//  nao foram atualizadas para ler o plano de licenca-premio continuam
//  funcionando normalmente, so sem essa checagem extra.
// ==========================================================

function parseData(valor: string | null): Date | null {
  if (!valor || !String(valor).trim()) return null;
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function hojeLocal(): Date {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  d.setHours(0, 0, 0, 0);
  return d;
}

// militar precisa ter: id, situacao, jmsDataInicio, jmsDataRetorno
type MilSituacao = {
  id: string;
  situacao: string | null;
  jmsDataInicio: string | null;
  jmsDataRetorno: string | null;
};

// Esta em JMS hoje? (tem inicio <= hoje e (sem retorno ou retorno >= hoje))
export function estaEmJmsHoje(m: MilSituacao, hoje: Date): boolean {
  const ini = parseData(m.jmsDataInicio);
  if (!ini) {
    // sem data, mas situacao diz JMS
    return (m.situacao ?? "").toLowerCase().includes("jms");
  }
  if (ini > hoje) return false;
  const ret = parseData(m.jmsDataRetorno);
  if (ret && ret < hoje) return false; // ja retornou
  return true;
}

export function situacaoCalculada(
  m: MilSituacao,
  idsEmFerias: Set<string>,
  hoje: Date,
  idsEmLicencaPremio?: Set<string>
): string {
  if (idsEmFerias.has(m.id)) return "Férias";
  if (estaEmJmsHoje(m, hoje)) return "JMS";
  if (idsEmLicencaPremio && idsEmLicencaPremio.has(m.id)) return "Licença-Prêmio";
  return m.situacao && m.situacao.trim() ? m.situacao.trim() : "—";
}

// Monta o conjunto de IDs que estao de ferias hoje, a partir das
// equipes e membros do ano corrente.
export function montarIdsEmFerias(
  equipes: {
    numeroEquipe: string;
    anoGozo: string;
    periodo1Inicio: string | null;
    periodo1Fim: string | null;
    periodo2Inicio: string | null;
    periodo2Fim: string | null;
  }[],
  membros: { idPmma: string; numeroEquipe: string; anoGozo: string }[],
  hoje: Date
): Set<string> {
  const ano = String(hoje.getFullYear());
  const equipeEmFerias = new Set<string>();
  equipes
    .filter((e) => e.anoGozo === ano)
    .forEach((e) => {
      const periodos = [
        { i: parseData(e.periodo1Inicio), f: parseData(e.periodo1Fim) },
        { i: parseData(e.periodo2Inicio), f: parseData(e.periodo2Fim) },
      ];
      const ativo = periodos.some((p) => p.i && p.f && p.i <= hoje && hoje <= p.f);
      if (ativo) equipeEmFerias.add(e.numeroEquipe);
    });

  const ids = new Set<string>();
  membros
    .filter((m) => m.anoGozo === ano && equipeEmFerias.has(m.numeroEquipe))
    .forEach((m) => ids.add(m.idPmma));
  return ids;
}

// Monta o conjunto de IDs que estao em Licenca-Premio hoje, a partir das
// equipes (1 periodo cada) e membros do ano corrente.
export function montarIdsEmLicencaPremio(
  equipes: {
    numeroEquipe: string;
    anoGozo: string;
    periodoInicio: string | null;
    periodoFim: string | null;
  }[],
  membros: { idPmma: string; numeroEquipe: string; anoGozo: string }[],
  hoje: Date
): Set<string> {
  const ano = String(hoje.getFullYear());
  const equipeAtiva = new Set<string>();
  equipes
    .filter((e) => e.anoGozo === ano)
    .forEach((e) => {
      const i = parseData(e.periodoInicio);
      const f = parseData(e.periodoFim);
      if (i && f && i <= hoje && hoje <= f) equipeAtiva.add(e.numeroEquipe);
    });

  const ids = new Set<string>();
  membros
    .filter((m) => m.anoGozo === ano && equipeAtiva.has(m.numeroEquipe))
    .forEach((m) => ids.add(m.idPmma));
  return ids;
}
