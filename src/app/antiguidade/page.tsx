import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import AntiguidadeTabela, { MilitarLinha } from "@/components/AntiguidadeTabela";
import { classificarPatente } from "@/lib/patentes";
import { hojeLocal, montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsInativos, semInativos } from "@/lib/inativos";

export const dynamic = "force-dynamic";

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* ordemData: transforma QUALQUER formato de data em um numero aaaammdd
   para ordenacao. Aceita:
     - vazio/null                         -> 99999999 (vai pro fim)
     - ISO  "2025-08-24" (com/sem hora)   -> 20250824
     - BR   "24/08/2025"                  -> 20250824
     - Date cru "Sun Aug 24 2025 00:00.." -> 20250824
   Datas "1970..." (epoch vazio) tambem vao pro fim. */
function ordemData(valor: string | null): number {
  if (!valor || !valor.trim()) return 99999999;
  const s = valor.trim();

  // ISO: aaaa-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const n = +`${iso[1]}${iso[2]}${iso[3]}`;
    return iso[1] === "1970" ? 99999999 : n;
  }

  // BR: dd/mm/aaaa
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const n = +`${br[3]}${br[2]}${br[1]}`;
    return br[3] === "1970" ? 99999999 : n;
  }

  // Date cru em ingles: "Sun Aug 24 2025 ..." -> pega "Aug 24 2025"
  const en = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (en) {
    const mes = MESES[en[1].toLowerCase()];
    if (mes) {
      const dia = +en[2], ano = +en[3];
      if (ano === 1970) return 99999999;
      return ano * 10000 + mes * 100 + dia;
    }
  }

  // ultimo recurso: deixa o Date tentar (ex.: outros formatos reconheciveis)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const ano = dt.getUTCFullYear();
    if (ano === 1970) return 99999999;
    return ano * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }

  return 99999999;
}

/* ordemBarra: desempate por numero de barra interpretado como ANO + NUMERO.
   "158/92" -> ano 1992, nº 158 ; "008/93" -> ano 1993, nº 008.
   Mais antigo = ano menor; no mesmo ano, numero menor.
   Retorna um numero comparavel: ano(4) * 100000 + numero(5). Anos de 2 digitos
   viram 19xx se >= 30, senao 20xx (ajuste a regra se precisar). Sem barra -> fim. */
function ordemBarra(barra: string | null): number {
  if (!barra || !barra.trim()) return 9_99999999;
  const m = barra.trim().match(/^(\d+)\s*\/\s*(\d{2,4})$/);
  if (!m) return 9_99999999;
  const num = parseInt(m[1], 10) || 0;
  let ano = parseInt(m[2], 10);
  if (m[2].length === 2) ano = ano >= 30 ? 1900 + ano : 2000 + ano; // 92->1992, 07->2007
  return ano * 100000 + num;
}

export default async function AntiguidadePage({
  searchParams,
}: {
  searchParams: { posto?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const hoje = hojeLocal();

  const militares = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, numeroBarra: true, nome: true, nomeGuerra: true,
        matricula: true, rg: true, cpf: true, situacao: true, lotacao: true,
        dataPromocao: true, jmsDataInicio: true, jmsDataRetorno: true,
      },
    }),
    await idsInativos(),
  );

  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje, await idsFeriasAdiadas());
  // ferias em datas soltas contam igual as do plano — sem isso, quem esta de
  // ferias avulsas aparecia aqui como se estivesse a disposicao
  // As férias avulsas também respeitam o adiamento: sem isto, quem o P/1
  // acabou de adiar voltava a aparecer de férias por esta linha.
  const idsAdiadosAvulsas = await idsFeriasAdiadas();
  for (const id of await idsFeriasAvulsasHoje(hoje)) if (!idsAdiadosAvulsas.has(id)) idsFerias.add(id);

  // licenca-premio de hoje
  const equipesLicenca = await prisma.equipeLicencaPremio.findMany();
  const membrosLicenca = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicenca, membrosLicenca, hoje);

  const ordenados = [...militares].sort((a, b) => {
    // 1) posto/graduacao
    const pa = classificarPatente(a.postoGrad).ordem;
    const pb = classificarPatente(b.postoGrad).ordem;
    if (pa !== pb) return pa - pb;
    // 2) data da ultima promocao (mais antiga primeiro)
    const da = ordemData(a.dataPromocao);
    const db = ordemData(b.dataPromocao);
    if (da !== db) return da - db;
    // 3) desempate: numero de barra (ano + numero)
    const ba = ordemBarra(a.numeroBarra);
    const bb = ordemBarra(b.numeroBarra);
    if (ba !== bb) return ba - bb;
    // 4) ultimo criterio estavel: nome
    return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
  });

  const linhas: MilitarLinha[] = ordenados.map((m) => ({
    id: m.id, postoGrad: m.postoGrad, numeroBarra: m.numeroBarra,
    nome: m.nome, nomeGuerra: m.nomeGuerra, matricula: m.matricula,
    rg: m.rg, cpf: m.cpf,
    situacao: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
    lotacao: m.lotacao,
  }));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Efetivo por Antiguidade</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Ordenado por posto e, dentro de cada posto, por data de promoção. Situação atualizada (férias/JMS/licença-prêmio de hoje).
        </p>
        <AntiguidadeTabela militares={linhas} postoInicial={searchParams.posto ?? ""} />
      </div>
    </AppShell>
  );
}
