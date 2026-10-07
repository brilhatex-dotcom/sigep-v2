import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import EfetivoLista from "@/components/EfetivoLista";
import LimparFuncoes from "@/components/LimparFuncoes";
import { hojeLocal, situacaoCalculada } from "@/lib/situacao";
import { feriasHoje, licencaPremioHoje } from "@/lib/afastadosHoje";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { idsInativos, semInativos } from "@/lib/inativos";

export const dynamic = "force-dynamic";

export default async function EfetivoPage({
  searchParams,
}: {
  searchParams: { q?: string; situacao?: string };
}) {
  // >>> SEGURANCA: bloqueia policial por URL e empurra 1o acesso p/ trocar senha. <<<
  const session = await exigirAdmin();

  const hoje = hojeLocal();

  const militares = semInativos(
    await prisma.efetivo.findMany({
      select: {
        id: true, postoGrad: true, nome: true, nomeGuerra: true,
        matricula: true, situacao: true, lotacao: true, telefone: true,
        jmsDataInicio: true, jmsDataRetorno: true,
      },
    }),
    await idsInativos(),
  );

  // fichas com FUNÇÃO preenchida (o P/1 pediu o campo em branco em todas)
  const comFuncao = await prisma.efetivo.count({
    where: { AND: [{ funcao: { not: null } }, { NOT: { funcao: "" } }] },
  });

  // ferias de hoje
  // só as equipes do ano e os membros das que estão em gozo hoje (lib/afastadosHoje)
  const idsFerias = await feriasHoje(hoje, await idsFeriasAdiadas());
  // As férias avulsas também respeitam o adiamento: sem isto, quem o P/1
  // acabou de adiar voltava a aparecer de férias por esta linha.
  const idsAdiadosAvulsas = await idsFeriasAdiadas();
  for (const id of await idsFeriasAvulsasHoje(hoje)) if (!idsAdiadosAvulsas.has(id)) idsFerias.add(id);

  // licenca-premio de hoje
  const idsLicencaPremio = await licencaPremioHoje(hoje);

  // aplica situacao calculada e remove os campos extra
  const lista = militares
    .map((m) => ({
      id: m.id,
      postoGrad: m.postoGrad,
      nome: m.nome,
      nomeGuerra: m.nomeGuerra,
      matricula: m.matricula,
      situacao: situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio),
      lotacao: m.lotacao,
      telefone: m.telefone,
    }))
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Cadastro de Efetivo</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">{lista.length} militares cadastrados.</p>
        <LimparFuncoes total={comFuncao} />
        <EfetivoLista militares={lista} buscaInicial={searchParams.q ?? ""} situacaoInicial={searchParams.situacao ?? ""} />
      </div>
    </AppShell>
  );
}
