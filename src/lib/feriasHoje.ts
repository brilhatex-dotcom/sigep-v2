import { prisma } from "@/lib/prisma";
import { hojeLocal, montarIdsEmFerias } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";

/* Resumo de FÉRIAS para os painéis (Centro de Comando e aba Férias).
   Junta o plano por equipes E as férias avulsas (datas soltas). Mostra:
   - quem está de férias HOJE (ativaHoje = true), e
   - as férias avulsas REGISTRADAS que ainda não terminaram (mesmo que comecem
     no futuro) — assim nada fica "invisível" e o "0 hoje" fica explicado.
   ========================================================================= */

export type FeriasItem = {
  id: string;
  nome: string;
  posto: string;
  origem: "equipe" | "avulsa";
  inicio: string; // ISO ou "" (equipe pode não ter data aqui)
  fim: string;
  ativaHoje: boolean;
};

function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// aceita ISO (aaaa-mm-dd) ou BR (dd/mm/aaaa) e devolve ISO; "" se inválida
function paraISO(v: string | null | undefined): string {
  const s = String(v || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export type ResumoFerias = { hojeCount: number; itens: FeriasItem[] };

export async function resumoFerias(): Promise<ResumoFerias> {
  const hoje = hojeLocal();
  const hojeISO = isoDe(hoje);
  const ano = String(hoje.getFullYear());

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();

  // ---- equipe: quem está de férias HOJE + o período ativo ----
  // Quem ADIOU as férias não entra na lista: continua no serviço normal.
  const adiados = await idsFeriasAdiadas();
  const idsEquipeHoje = montarIdsEmFerias(equipes, membros, hoje, adiados);
  // mapa equipe -> período ativo hoje (para exibir as datas)
  const periodoAtivo = new Map<string, { inicio: string; fim: string }>();
  for (const e of equipes.filter((x) => x.anoGozo === ano)) {
    for (const per of [
      { i: paraISO(e.periodo1Inicio), f: paraISO(e.periodo1Fim) },
      { i: paraISO(e.periodo2Inicio), f: paraISO(e.periodo2Fim) },
    ]) {
      if (per.i && per.f && per.i <= hojeISO && hojeISO <= per.f) periodoAtivo.set(e.numeroEquipe, { inicio: per.i, fim: per.f });
    }
  }

  // ---- avulsas: todas que ainda NÃO terminaram (fim >= hoje) ----
  type Avulsa = { idPmma: string; inicio: string; fim: string };
  let avulsas: Avulsa[] = [];
  try {
    const row = await prisma.config.findUnique({ where: { chave: "ferias_avulsas" } });
    const lista = row?.valor ? JSON.parse(row.valor) : [];
    if (Array.isArray(lista)) {
      avulsas = lista
        .map((a: any) => ({ idPmma: String(a?.idPmma || ""), inicio: paraISO(a?.inicio), fim: paraISO(a?.fim) }))
        .filter((a) => a.idPmma && a.fim && a.fim >= hojeISO);
    }
  } catch { /* ignora */ }
  const idsAvulsaHoje = await idsFeriasAvulsasHoje(hoje);

  // ---- monta a lista de IDs e busca as fichas ----
  const ids = new Set<string>([...idsEquipeHoje, ...avulsas.map((a) => a.idPmma)]);
  if (ids.size === 0) return { hojeCount: 0, itens: [] };

  const fichas = await prisma.efetivo.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, postoGrad: true, nome: true, nomeGuerra: true },
  });
  const mapa = new Map(fichas.map((f) => [f.id, f]));
  const nomeDe = (id: string) => (mapa.get(id)?.nomeGuerra || mapa.get(id)?.nome || id).trim();
  const postoDe = (id: string) => (mapa.get(id)?.postoGrad || "").trim();

  const itens: FeriasItem[] = [];

  // equipe (só quem está hoje)
  for (const m of membros) {
    if (m.anoGozo !== ano || !idsEquipeHoje.has(m.idPmma)) continue;
    const per = periodoAtivo.get(m.numeroEquipe);
    itens.push({ id: m.idPmma, nome: nomeDe(m.idPmma), posto: postoDe(m.idPmma), origem: "equipe", inicio: per?.inicio || "", fim: per?.fim || "", ativaHoje: true });
  }
  // avulsas (ativas hoje ou futuras que ainda não terminaram)
  for (const a of avulsas) {
    itens.push({ id: a.idPmma, nome: nomeDe(a.idPmma), posto: postoDe(a.idPmma), origem: "avulsa", inicio: a.inicio, fim: a.fim, ativaHoje: idsAvulsaHoje.has(a.idPmma) });
  }

  itens.sort((a, b) => (Number(b.ativaHoje) - Number(a.ativaHoje)) || a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome));
  const hojeCount = itens.filter((i) => i.ativaHoje).length;
  return { hojeCount, itens };
}
