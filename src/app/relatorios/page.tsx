import { exigirAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import RelatoriosClient from "@/components/RelatoriosClient";
import { ORGANOGRAMA, pertenceAoNo, type NoOrg } from "@/lib/organograma";
import { idsInativos, semInativos } from "@/lib/inativos";
import {
  montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada, estaEmJmsHoje, hojeLocal,
} from "@/lib/situacao";
import { idsFeriasAdiadas } from "@/lib/feriasAdiadas";
import { idsFeriasAvulsasHoje } from "@/lib/feriasAvulsas";
import { paraData, dataBR, idade as calcIdade, tempoServico } from "@/lib/datas";
import type { MilitarRelatorio } from "@/lib/relatorioCampos";

export const dynamic = "force-dynamic";

/* CENTRAL DE RELATÓRIOS
   Uma tela para tirar qualquer relação do efetivo: escolhe as colunas, filtra
   por unidade/situação/posto e exporta em Excel, CSV, PDF ou Word.

   Tudo é resolvido AQUI, no servidor, e vai pronto para a tela: a situação de
   hoje (com férias, JMS e licença-prêmio já aplicados), a unidade e a
   subunidade pelo organograma, a idade e o tempo de serviço. Assim o
   relatório mostra exatamente o mesmo que o resto do sistema — não é uma
   segunda leitura dos mesmos dados, que sairia diferente na primeira
   divergência. */

// Lista achatada dos nós do organograma, para o seletor de unidade.
export type OpcaoUnidade = { id: string; rotulo: string; nivel: number };
function achatar(no: NoOrg, nivel = 0, fora: OpcaoUnidade[] = []): OpcaoUnidade[] {
  if (nivel > 0) fora.push({ id: no.id, rotulo: no.rotulo, nivel });
  (no.filhos || []).forEach((f) => achatar(f, nivel + 1, fora));
  return fora;
}

// Nó mais específico a que o militar pertence (o pelotão, quando houver).
function localizar(lotacao: string | null, no: NoOrg): { unidade: string | null; sub: string | null } {
  for (const filho of no.filhos || []) {
    if (!pertenceAoNo(lotacao, filho)) continue;
    for (const neto of filho.filhos || []) {
      if (pertenceAoNo(lotacao, neto)) return { unidade: filho.rotulo, sub: neto.rotulo };
    }
    return { unidade: filho.rotulo, sub: null };
  }
  return { unidade: null, sub: null };
}

export default async function RelatoriosPage() {
  const session = await exigirAdmin();
  const hoje = hojeLocal();

  const militares = semInativos(await prisma.efetivo.findMany(), await idsInativos());

  // ---- ausências de hoje, pelas mesmas regras do resto do sistema ----
  const equipes = await prisma.equipeFerias.findMany();
  const membros = await prisma.membroFerias.findMany();
  const adiados = await idsFeriasAdiadas();
  const idsFerias = montarIdsEmFerias(equipes, membros, hoje, adiados);
  for (const id of await idsFeriasAvulsasHoje(hoje)) if (!adiados.has(id)) idsFerias.add(id);
  // JMS na frente das férias: quem está em JMS não entra de férias.
  for (const m of militares) if (estaEmJmsHoje(m, hoje)) idsFerias.delete(m.id);

  const equipesLP = await prisma.equipeLicencaPremio.findMany();
  const membrosLP = await prisma.membroLicencaPremio.findMany();
  const idsLP = montarIdsEmLicencaPremio(equipesLP, membrosLP, hoje);

  const linhas: MilitarRelatorio[] = militares.map((m) => {
    const { unidade, sub } = localizar(m.lotacao, ORGANOGRAMA);
    const nasc = paraData(m.dataNasc);
    const incorp = paraData(m.dataIncorp);
    const ts = incorp ? tempoServico(incorp, hoje) : null;
    return {
      id: m.id,
      postoGrad: m.postoGrad, numeroBarra: m.numeroBarra, nome: m.nome, nomeGuerra: m.nomeGuerra,
      matricula: m.matricula, cpf: m.cpf, rg: m.rg,
      situacao: situacaoCalculada(m, idsFerias, hoje, idsLP),
      situacaoFicha: m.situacao,
      lotacao: m.lotacao, unidade, subunidade: sub,
      telefone: m.telefone, email: m.email,
      dataNasc: dataBR(m.dataNasc), dataIncorp: dataBR(m.dataIncorp), dataPromocao: dataBR(m.dataPromocao),
      estadoCivil: m.estadoCivil, sexo: m.sexo, quadro: m.quadro, funcao: m.funcao,
      endereco: m.endereco, bairro: m.bairro, cidade: m.cidade, cep: m.cep,
      naturalidade: m.naturalidade, naturalidadeUF: m.naturalidadeUF,
      nomePai: m.nomePai, nomeMae: m.nomeMae,
      tipoSanguineo: m.tipoSanguineo, fatorRH: m.fatorRH,
      grauEscolaridade: m.grauEscolaridade, cursosPMMA: m.cursosPMMA,
      banco: m.banco, agencia: m.agencia, conta: m.conta, tipoConta: m.tipoConta,
      emergenciaNome: m.emergenciaNome, emergenciaTelefone: m.emergenciaTelefone, emergenciaGrau: m.emergenciaGrau,
      cnh: m.cnh, cnhCategoria: m.cnhCategoria, cnhVencimento: dataBR(m.cnhVencimento),
      equipeFerias: m.equipeFerias,
      idade: nasc ? calcIdade(nasc, hoje) : null,
      tempoServico: ts ? `${ts.anos}a ${ts.meses}m` : null,
      observacoes: m.observacoes,
      // guardado só para o filtro de aniversariantes (mês do nascimento)
      mesNasc: nasc ? nasc.getMonth() + 1 : null,
    } as MilitarRelatorio & { mesNasc: number | null };
  });

  const unidades = achatar(ORGANOGRAMA);
  const situacoes = Array.from(new Set(linhas.map((l) => l.situacao).filter(Boolean) as string[])).sort();
  const postos = Array.from(new Set(linhas.map((l) => (l.postoGrad || "").trim()).filter(Boolean)));

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl">
        <RelatoriosClient
          militares={linhas}
          unidades={unidades}
          situacoes={situacoes}
          postos={postos}
        />
      </div>
    </AppShell>
  );
}
