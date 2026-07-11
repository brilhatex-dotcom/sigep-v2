import Link from "next/link";
import AtivarNotificacoes from "@/components/AtivarNotificacoes";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import BarrasPosto from "@/components/BarrasPosto";
import BannerAlertas, { Alerta } from "@/components/BannerAlertas";
import FraseRotativa from "@/components/FraseRotativa";
import JmsTabela, { LinhaJms } from "@/components/JmsTabela";
import { classificarPatente } from "@/lib/patentes";
import { montarIdsEmFerias, montarIdsEmLicencaPremio, situacaoCalculada } from "@/lib/situacao";
import {
  hojeBR, paraData, dataBR, diffDias, idade, diasAteAniversario, tempoServico,
} from "@/lib/datas";
import {
  Users, Cake, HeartPulse, CheckCircle2, Plane, ShieldAlert, Hourglass, ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function isoDe(valor: string | null): string {
  const d = paraData(valor);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default async function DashboardPage() {
  const session = await exigirAdmin();

  const hoje = hojeBR();
  const mesAtual = hoje.getMonth();

  const militares = await prisma.efetivo.findMany();
  const total = militares.length;

  // ferias de hoje (para situacao calculada) - busca antecipada
  const equipesTodas = await prisma.equipeFerias.findMany();
  const membrosTodos = await prisma.membroFerias.findMany();
  const idsFerias = montarIdsEmFerias(equipesTodas, membrosTodos, hoje);

  // licenca-premio de hoje (mesma logica das ferias, 1 periodo por equipe)
  const equipesLicencaTodas = await prisma.equipeLicencaPremio.findMany();
  const membrosLicencaTodos = await prisma.membroLicencaPremio.findMany();
  const idsLicencaPremio = montarIdsEmLicencaPremio(equipesLicencaTodas, membrosLicencaTodos, hoje);

  // ---- situacao + baldes (usando situacao CALCULADA) ----
  const porSituacao = new Map<string, number>();
  let prontos = 0, licencas = 0, jmsCount = 0, reservaCount = 0, feriasCount = 0;
  militares.forEach((m) => {
    const s = situacaoCalculada(m, idsFerias, hoje, idsLicencaPremio);
    porSituacao.set(s, (porSituacao.get(s) ?? 0) + 1);
    const low = s.toLowerCase();
    if (low.includes("pronto")) prontos++;
    else if (low.includes("jms")) jmsCount++;
    else if (low.includes("reserva")) reservaCount++;
    else if (low.includes("féria") || low.includes("feria")) feriasCount++;
    else if (low.includes("licen") || low.includes("lp") || low.includes("ltip")) licencas++;
  });
  const situacoes = Array.from(porSituacao.entries())
    .map(([rotulo, valor]) => ({ rotulo, valor, pct: Math.round((valor/total)*100) }))
    .sort((a,b)=>b.valor-a.valor);

  // ---- por posto ----
  const porPosto = new Map<string, number>();
  militares.forEach((m)=>{ const p=(m.postoGrad??"").trim()||"(s/ posto)"; porPosto.set(p,(porPosto.get(p)??0)+1); });
  const postos = Array.from(porPosto.entries())
    .map(([rotulo,valor])=>({rotulo,valor}))
    .sort((a,b)=>classificarPatente(a.rotulo).ordem - classificarPatente(b.rotulo).ordem);

  // ---- por sexo ----
  let masc=0, fem=0;
  militares.forEach((m)=>{ const s=(m.sexo??"").trim().toUpperCase(); if(s.startsWith("M"))masc++; else if(s.startsWith("F"))fem++; });

  // ---- JMS (tabela + alertas) ----
  const emJms = militares.filter((m)=>{
    const temInicio=!!(m.jmsDataInicio&&m.jmsDataInicio.trim());
    const semRetornoPassado=true;
    const sit=(m.situacao??"").toLowerCase().includes("jms");
    return (temInicio&&semRetornoPassado)||sit;
  }).filter((m)=> m.jmsDataInicio && m.jmsDataInicio.trim() || (m.situacao??"").toLowerCase().includes("jms"));

  const linhasJms: LinhaJms[] = emJms.map((m)=>{
    const ini=paraData(m.jmsDataInicio);
    const ret=paraData(m.jmsDataRetorno);
    const dias= ini? Math.max(0,diffDias(ini,hoje)) : 0;
    let urgencia: LinhaJms["urgencia"]="sem";
    if(ret){ const d=diffDias(hoje,ret); urgencia = d<0?"vencida": d<=7?"proxima":"normal"; }
    return {
      id:m.id, nome:m.nomeGuerra||m.nome||"—", postoGrad:m.postoGrad||"—",
      inicioBR:dataBR(m.jmsDataInicio), inicioISO:isoDe(m.jmsDataInicio),
      retornoBR:dataBR(m.jmsDataRetorno), retornoISO:isoDe(m.jmsDataRetorno),
      dias, motivo:(m.jmsMotivo&&m.jmsMotivo.trim())?m.jmsMotivo:"—", urgencia,
    };
  });

  // ---- alertas dinamicos (JMS a vencer) + avisos manuais ----
  const dispensados = await prisma.alertaDispensado.findMany({ select:{ chave:true } });
  const setDisp = new Set(dispensados.map((d)=>d.chave));

  const alertasJms: Alerta[] = linhasJms
    .filter((l)=> l.urgencia==="vencida"||l.urgencia==="proxima")
    .map((l)=>({
      chave:`jms:${l.id}:${l.retornoISO}`,
      tipo:"jms_vencendo" as const,
      nivel:(l.urgencia==="vencida"?"critico":"atencao") as "critico"|"atencao",
      texto: l.urgencia==="vencida"
        ? `Reavaliação de JMS vencida: ${l.postoGrad} ${l.nome} (retorno ${l.retornoBR}).`
        : `JMS a vencer: ${l.postoGrad} ${l.nome} retorna em ${l.retornoBR}.`,
    }))
    .filter((a)=> !setDisp.has(a.chave));

  // avisos manuais ativos (validade futura ou sem validade)
  const avisos = await prisma.aviso.findMany({ orderBy:{ criadoEm:"desc" } });
  const hojeISO=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-${String(hoje.getDate()).padStart(2,"0")}`;
  const alertasAvisos: Alerta[] = avisos
    .filter((a)=> !a.validade || a.validade >= hojeISO)
    .map((a)=>({
      chave:`aviso:${a.id}`,
      tipo:"ferias_vencidas" as const, // reusa o tipo so para icone; nivel define cor
      nivel:(a.cor==="critico"?"critico":"atencao") as "critico"|"atencao",
      texto:a.texto,
    }));

  const alertas=[...alertasJms, ...alertasAvisos];

  // ---- aniversariantes do mes ----
  const aniversariantes = militares
    .map((m)=>({ m, nasc:paraData(m.dataNasc) }))
    .filter((x)=> x.nasc && x.nasc.getMonth()===mesAtual)
    .map((x)=>({
      ...x.m,
      dia:x.nasc!.getDate(),
      idadeCompleta: idade(x.nasc!,hoje)+ (diasAteAniversario(x.nasc!,hoje)===0?0:1),
      faltam: diasAteAniversario(x.nasc!,hoje),
    }))
    .sort((a,b)=> a.dia-b.dia);

  // ---- ferias hoje: AGRUPADO POR EQUIPE (do plano do ano corrente) ----
  const anoStr=String(hoje.getFullYear());
  const equipes = await prisma.equipeFerias.findMany({ where:{ anoGozo:anoStr } });
  const membros = await prisma.membroFerias.findMany({ where:{ anoGozo:anoStr } });
  const mapaEquipe=new Map(equipes.map((e)=>[e.numeroEquipe,e]));
  const fichasMap=new Map(militares.map((m)=>[m.id,m]));

  // conta quantos militares cada equipe tem (do plano do ano)
  const totalPorEquipe=new Map<string,number>();
  membros.forEach((mb)=>{ totalPorEquipe.set(mb.numeroEquipe,(totalPorEquipe.get(mb.numeroEquipe)??0)+1); });

  // monta as equipes que estao de ferias HOJE (periodo 1 ou 2 engloba hoje)
  type EquipeFeriasItem={
    numero:string; periodo:1|2; inicioBR:string; fimBR:string;
    restam:number; fimTime:number; qtd:number;
  };
  const equipesEmFerias:EquipeFeriasItem[]=[];
  equipes.forEach((e)=>{
    const periodos=[
      { n:1 as const, i:paraData(e.periodo1Inicio), f:paraData(e.periodo1Fim), iRaw:e.periodo1Inicio, fRaw:e.periodo1Fim },
      { n:2 as const, i:paraData(e.periodo2Inicio), f:paraData(e.periodo2Fim), iRaw:e.periodo2Inicio, fRaw:e.periodo2Fim },
    ];
    for(const p of periodos){
      if(p.i&&p.f&&p.i<=hoje&&hoje<=p.f){
        equipesEmFerias.push({
          numero:e.numeroEquipe,
          periodo:p.n,
          inicioBR:dataBR(p.iRaw),
          fimBR:dataBR(p.fRaw),
          restam:Math.max(0,diffDias(hoje,p.f)),
          fimTime:p.f.getTime(),
          qtd: totalPorEquipe.get(e.numeroEquipe) ?? 0,
        });
      }
    }
  });
  equipesEmFerias.sort((a,b)=>a.fimTime-b.fimTime);

  // total de militares de ferias hoje (soma das equipes em ferias)
  const totalMilitaresFerias = equipesEmFerias.reduce((s,e)=>s+e.qtd,0);
  const pctFerias= total? Math.round((totalMilitaresFerias/total)*100):0;

  const maxSit=Math.max(1,...situacoes.map((s)=>s.valor));
  const pctOper= total? Math.round((prontos/total)*100):0;
  const aniversariantesHoje=aniversariantes.filter((a)=>a.faltam===0).length;

  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Centro de Comando — 18º BPM</h1>
          <p className="text-sm text-[#94A3B8]">Visão estratégica do efetivo.</p>
        </div>

        <FraseRotativa />
        <BannerAlertas alertas={alertas} />

        {/* Centro de Comando P1 */}
        <section className="ui-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Centro de Comando · P1
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Mini Icone={Users} cor="#D4AF37" valor={total} rotulo="Efetivo total" />
            <Mini Icone={CheckCircle2} cor="#22C55E" valor={prontos} rotulo={`Prontos · ${pctOper}%`} />
            <Mini Icone={HeartPulse} cor="#F59E0B" valor={jmsCount} rotulo="Em JMS" />
            <Mini Icone={Plane} cor="#3B82F6" valor={totalMilitaresFerias} rotulo="Em férias" />
            <Mini Icone={ShieldAlert} cor="#94A3B8" valor={licencas} rotulo="Licenças" />
            <Mini Icone={Cake} cor="#EC4899" valor={aniversariantesHoje} rotulo="Aniv. hoje" />
          </div>
        </section>

        {/* graficos */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ui-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Efetivo por posto
            </h2>
            <BarrasPosto dados={postos} />
          </section>

          <section className="ui-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Efetivo por situação
            </h2>
            <div className="space-y-2.5">
              {situacoes.map((s)=>(
                <div key={s.rotulo} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs text-[#94A3B8]">{s.rotulo}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                    <div className="h-full rounded bg-gradient-to-r from-sky-500/60 to-sky-400" style={{width:`${(s.valor/maxSit)*100}%`}} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold text-white">
                    {s.valor} <span className="text-[#94A3B8]">{s.pct}%</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 border-t border-white/10 pt-3 text-xs text-[#94A3B8]">
              <span>♂ Masculino: <b className="text-white">{masc}</b></span>
              <span>♀ Feminino: <b className="text-white">{fem}</b></span>
            </div>
          </section>
        </div>

        {/* JMS */}
        <JmsTabela linhas={linhasJms} />

        {/* ferias (por equipe) + aniversariantes */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ui-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <Plane className="h-4 w-4 text-[#3B82F6]" /> Efetivo em férias · {totalMilitaresFerias} ({pctFerias}%)
              </h2>
            </div>
            {equipesEmFerias.length===0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">Nenhuma equipe em férias hoje.</p>
            ):(
              <ul className="space-y-3">
                {equipesEmFerias.map((e,i)=>(
                  <li key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">
                          Equipe {e.numero}
                          <span className="ml-2 rounded-full bg-[#3B82F6]/15 px-2 py-0.5 text-[10px] font-semibold text-[#7Fb4ff]">
                            {e.qtd} {e.qtd===1?"militar":"militares"}
                          </span>
                        </p>
                        <p className="mt-1 text-[12px] text-[#94A3B8]">
                          {e.inicioBR} <span className="text-[#5b6b85]">até</span> {e.fimBR}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-[#D4AF37]">{e.restam}</p>
                        <p className="text-[10px] text-[#94A3B8]">dias p/ voltar</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/ferias" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#D4AF37] hover:underline print:hidden">
              Ver plano completo <ChevronRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="ui-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <Cake className="h-4 w-4 text-[#D4AF37]" /> Aniversariantes de {MESES[mesAtual]} ({aniversariantes.length})
            </h2>
            {aniversariantes.length===0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">Nenhum aniversariante este mês.</p>
            ):(
              <ul className="relative space-y-3 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-white/10">
                {aniversariantes.map((m)=>(
                  <li key={m.id} className="relative flex items-center gap-3">
                    <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-[#0F1B2D] ${m.faltam===0?"bg-[#D4AF37] text-[#1a1205]":"bg-[#D4AF37]/15 text-[#D4AF37]"}`}>
                      {String(m.dia).padStart(2,"0")}
                    </span>
                    <div>
                      <p className="text-sm text-white/90">
                        <span className="text-[#94A3B8]">{m.postoGrad?`${m.postoGrad} `:""}</span>
                        {m.nomeGuerra||m.nome}
                        {m.faltam===0 && <span className="ml-2 rounded-full bg-[#D4AF37] px-2 py-0.5 text-[9px] font-bold uppercase text-[#1a1205]">🎉 hoje</span>}
                      </p>
                      <p className="text-[11px] text-[#94A3B8]">
                        completa {m.idadeCompleta} anos {m.faltam>0?`· faltam ${m.faltam} dia(s)`:""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Notificacoes no celular (movido para o final) */}
        <AtivarNotificacoes />
      </div>
    </AppShell>
  );
}

function Mini({ Icone, cor, valor, rotulo }:{
  Icone: React.ComponentType<{className?:string;style?:React.CSSProperties}>;
  cor:string; valor:number; rotulo:string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
      <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{backgroundColor:`${cor}22`}}>
        <Icone className="h-4 w-4" style={{color:cor}} />
      </div>
      <p className="text-xl font-bold text-white">{valor}</p>
      <p className="text-[11px] text-[#94A3B8]">{rotulo}</p>
    </div>
  );
}
