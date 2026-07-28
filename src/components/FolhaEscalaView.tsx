"use client";

/* =========================================================================
   Folha da escala em modo LEITURA — o que o policial vê na tela.

   Reproduz o formato da escala oficial, mas pensado para ser lido no
   celular: sem baixar arquivo, sem zoom, sem PDF. É o mesmo conteúdo que
   sai no papel, só que legível de imediato.
   ========================================================================= */

type Slot = { titular?: string; permuta?: string | null; status?: string | null };

function limpo(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}
/** ftPatrulheiro pode ser Slot (folhas antigas) ou Slot[] (novo). */
function comoLista(v: any): Slot[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}
function nomes(v: any): { nome: string; permuta: string }[] {
  return comoLista(v)
    .map((s) => ({ nome: limpo(s?.titular), permuta: limpo(s?.permuta) }))
    .filter((x) => x.nome || x.permuta);
}

/** Uma linha da folha: rótulo à esquerda, militares à direita. */
function Linha({ rotulo, valor }: { rotulo: string; valor: any }) {
  const lista = nomes(valor);
  return (
    <div className="flex border-b border-white/5 last:border-0">
      <div className="w-28 shrink-0 border-r border-white/5 bg-white/[.03] px-2 py-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-[#94A3B8] sm:w-36 sm:text-[11px]">
        {rotulo}
      </div>
      <div className="min-w-0 flex-1 px-2.5 py-2">
        {lista.length === 0 ? (
          <span className="text-sm text-[#5b6b85]">—</span>
        ) : (
          <ul className="space-y-0.5">
            {lista.map((m, i) => (
              <li key={i} className="text-sm leading-snug text-white">
                {m.permuta ? (
                  <>
                    <span className="text-[#94A3B8] line-through">{m.nome}</span>{" "}
                    <span className="font-semibold text-[#D4AF37]">→ {m.permuta}</span>
                    <span className="ml-1 rounded bg-[#D4AF37]/15 px-1 text-[9px] font-bold uppercase text-[#D4AF37]">permuta</span>
                  </>
                ) : (
                  m.nome
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Faixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#16243a] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#D4AF37]">
      {children}
    </div>
  );
}

const TIPOS: Record<string, string> = {
  normal: "Escala de Serviço",
  feriado: "Escala de Feriado",
  facultativo: "Ponto Facultativo",
  extraordinaria: "Escala Extraordinária",
  joe: "Escala da JOE / RENE",
};

export default function FolhaEscalaView({
  escala,
  publicadoEm,
  publicadoPor,
}: {
  escala: any;
  publicadoEm?: string;
  publicadoPor?: string;
}) {
  if (!escala) return null;
  const e = escala;
  const exp = e.expediente || {};
  const ehExtra = e.tipo === "extraordinaria";

  const dataBR = (() => {
    const m = String(e.data || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(e.data || "");
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const semana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][d.getDay()];
    return `${m[3]}/${m[2]}/${m[1]} · ${semana}`;
  })();

  const quandoPub = publicadoEm
    ? new Date(publicadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="overflow-hidden rounded-xl border border-[#1d2c44] bg-[#0F1B2D]">
      {/* cabeçalho */}
      <div className="border-b border-white/10 bg-gradient-to-b from-[#16243a] to-[#0F1B2D] px-4 py-3 text-center">
        <p className="text-[10px] font-semibold tracking-[0.3em] text-[#D4AF37]">★ POLÍCIA MILITAR DO MARANHÃO ★</p>
        <p className="text-sm font-extrabold uppercase text-white">18º Batalhão de Polícia Militar</p>
        <p className="mt-1 text-xs font-bold text-[#D4AF37]">
          {TIPOS[e.tipo] || "Escala de Serviço"}
          {e.tipo === "feriado" && e.feriadoLabel ? ` · ${limpo(e.feriadoLabel)}` : ""}
        </p>
        <p className="text-sm font-semibold text-white">{dataBR}</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-[#94A3B8]">
          {e.apresentacao && <span>Apresentação: <b className="text-[#cdd9ea]">{limpo(e.apresentacao)}</b></span>}
          {e.servicoHoras && <span>Serviço: <b className="text-[#cdd9ea]">{limpo(e.servicoHoras)}</b></span>}
        </div>
      </div>

      {/* extraordinária: dados da operação */}
      {ehExtra && (
        <>
          <Faixa>Operação</Faixa>
          <div className="divide-y divide-white/5">
            {e.extraOperacao && <Linha rotulo="Operação" valor={{ titular: e.extraOperacao }} />}
            {e.extraCmtOperacao && <Linha rotulo="Cmt da Operação" valor={{ titular: e.extraCmtOperacao }} />}
            {e.extraLocal && <Linha rotulo="Local" valor={{ titular: e.extraLocal }} />}
            {e.extraHorario && <Linha rotulo="Horário" valor={{ titular: e.extraHorario }} />}
            {e.extraUniforme && <Linha rotulo="Uniforme" valor={{ titular: e.extraUniforme }} />}
          </div>
          {Array.isArray(e.extraReforco) && e.extraReforco.some((r: any) => limpo(r?.nome)) && (
            <>
              <Faixa>Reforço</Faixa>
              <ul className="divide-y divide-white/5">
                {e.extraReforco.filter((r: any) => limpo(r?.nome)).map((r: any, i: number) => (
                  <li key={i} className="flex gap-2 px-3 py-1.5 text-sm text-white">
                    <span className="w-5 shrink-0 text-[#5b6b85]">{i + 1}</span>
                    <span className="text-[#94A3B8]">{limpo(r?.postoGrad)}</span>
                    <span>{limpo(r?.nome)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* expediente */}
      {(exp.cmt || exp.subcmt || exp.cmtFt || (exp.p1 || []).length > 0) && (
        <>
          <Faixa>Expediente {exp.horario ? `· ${limpo(exp.horario)}` : ""}</Faixa>
          <div>
            {exp.cmt && <Linha rotulo="Cmt" valor={{ titular: exp.cmt }} />}
            {exp.subcmt && <Linha rotulo="Subcmt" valor={{ titular: exp.subcmt }} />}
            {exp.cmtFt && <Linha rotulo="Cmt FT" valor={{ titular: exp.cmtFt }} />}
            <Linha rotulo="P/4" valor={exp.p4} />
            <Linha rotulo="P/1" valor={exp.p1} />
            <Linha rotulo="Ronda Escolar" valor={exp.rondaEscolar} />
            <Linha rotulo="P/3" valor={exp.p3} />
            <Linha rotulo="Patrulha Maria da Penha" valor={exp.patrulha} />
          </div>
        </>
      )}

      <Faixa>CPU de dia</Faixa>
      <Linha rotulo="CPU de dia" valor={e.cpuDeDia} />

      <Faixa>Guarda do Quartel</Faixa>
      <Linha rotulo="Permanente" valor={e.guardaPermanente} />

      <Faixa>Rádio Patrulha</Faixa>
      <div>
        <Linha rotulo="Adjunto de dia" valor={e.rpAdjunto} />
        <Linha rotulo="Motorista" valor={e.rpMotorista} />
        <Linha rotulo="Patrulheiro" valor={e.rpPatrulheiro} />
      </div>

      <Faixa>Serviço de Inteligência · 24 h</Faixa>
      <Linha rotulo="Inteligência" valor={e.inteligencia} />

      <Faixa>Força Tática</Faixa>
      <div>
        <Linha rotulo="Graduado" valor={e.ftGraduado} />
        <Linha rotulo="Motorista" valor={e.ftMotorista} />
        <Linha rotulo="Patrulheiro" valor={e.ftPatrulheiro} />
      </div>

      {(comoLista(e.rotemMilitares).length > 0 || (e.rotemHorarios || []).filter(Boolean).length > 0) && (
        <>
          <Faixa>ROTEM {(e.rotemHorarios || []).filter(Boolean).join(" · ")}</Faixa>
          <Linha rotulo="ROTEM" valor={e.rotemMilitares} />
        </>
      )}

      {limpo(e.observacao) && (
        <div className="border-t border-white/10 bg-amber-500/5 px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Observação</p>
          <p className="whitespace-pre-wrap text-sm text-[#e8eef6]">{limpo(e.observacao)}</p>
        </div>
      )}

      {quandoPub && (
        <div className="border-t border-white/10 px-3 py-2 text-center text-[10px] text-[#5b6b85]">
          Publicado em {quandoPub}{publicadoPor ? ` por ${publicadoPor}` : ""}
        </div>
      )}
    </div>
  );
}
