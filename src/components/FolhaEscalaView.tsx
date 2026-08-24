"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2, Printer } from "lucide-react";
import CarimboSigep from "@/components/CarimboSigep";

/* =========================================================================
   Folha da escala em modo LEITURA — a folha BRANCA, igual ao documento
   original da escala diária da sede.

   É a mesma marcação e o mesmo CSS da folha do administrador (brasões,
   cabeçalho do órgão, VISTO do Cmt., tabelas com borda, assinatura do
   Chefe do P/1), só que sem nada de edição. Como a folha tem 210 mm de
   largura, ela é reduzida para caber na tela do celular — com botões de
   zoom e de imprimir para quem quiser ampliar.
   ========================================================================= */

type Slot = { titular?: string; permuta?: string | null; status?: string | null };
type Chefe = {
  nome?: string; funcao?: string; assinatura?: string; assinarGov?: boolean;
  cmtAssinatura?: string; cmtModo?: string; comandante?: string;
};
type Brasoes = { pmma?: string; ma?: string; bpm?: string };
type Ass = { id: string; token: string; nome: string; cargo: string; em: string };

const LARGURA_PAPEL = 794;   // 210 mm a 96 dpi

/* Publicações antigas podem não ter guardado os brasões — usa os do sistema. */
const BRASOES_PADRAO = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};

const ORG_TEXTO = [
  "ESTADO DO MARANHÃO",
  "SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA",
  "POLÍCIA MILITAR DO MARANHÃO",
  "COMANDO DO POLICIAMENTO DE ÁREA I/2",
  "18º BATALHÃO DE POLÍCIA MILITAR",
  "Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000",
  "(99) 98509-5005(Permanência) – 18batalhaopmma@gmail.com",
];
const DIAS_SEMANA = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseISO(iso: string): Date {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
}
function diaSemana(iso: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? "" : DIAS_SEMANA[d.getDay()];
}
function ehFimDeSemana(iso: string): boolean {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return false;
  return d.getDay() === 0 || d.getDay() === 6;
}
function extensoUpper(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return String(iso || "");
  return `${String(d.getDate()).padStart(2, "0")} DE ${MESES[d.getMonth()].toUpperCase()} DE ${d.getFullYear()}`;
}
function extensoLow(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return String(iso || "");
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function semTags(html: string): string {
  return String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}
/** ftPatrulheiro e afins podem ser Slot (folhas antigas) ou Slot[] (novo). */
function comoLista(v: any): Slot[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}

/* ---------- pedaços da folha, só leitura ---------- */

/** Texto que veio do editor da escala: pode ter negrito, cor, realce. */
function T({ html }: { html?: string | null }) {
  return <span dangerouslySetInnerHTML={{ __html: String(html ?? "") }} />;
}

/** Um militar: nome e, se houver, a permuta — igual sai no papel. */
function SlotTexto({ slot, semPermuta }: { slot: Slot; semPermuta?: boolean }) {
  const sub = semTags(String(slot?.permuta ?? ""));
  return (
    <span className="slot">
      <T html={slot?.titular} />
      {!semPermuta && slot?.permuta !== null && slot?.permuta !== undefined && sub && (
        <span className="perm"> (PERMUTA- <T html={String(slot.permuta)} />)</span>
      )}
    </span>
  );
}

function ListaTexto({ valor, center, centro, semPermuta }: {
  valor: any; center?: boolean; centro?: boolean; semPermuta?: boolean;
}) {
  const slots = comoLista(valor).filter((s) => semTags(String(s?.titular ?? "")) || semTags(String(s?.permuta ?? "")));
  if (!slots.length) return <span />;
  return (
    <div className={centro ? "lista centro" : center ? "lista center" : "lista"}>
      {slots.map((sl, i) => (
        <div key={i} className="linha"><SlotTexto slot={sl} semPermuta={semPermuta} /></div>
      ))}
    </div>
  );
}

/** Observação de uma seção: linha fina abaixo do bloco. Vazia, não aparece. */
function ObsSecao({ texto }: { texto?: string }) {
  if (!semTags(texto || "")) return null;
  return (
    <tr><td className="obs-sec" colSpan={2}><b>OBS:</b> <T html={texto} /></td></tr>
  );
}

function Brasao({ src, w, h }: { src?: string; w: number; h: number }) {
  if (!src) return <div style={{ width: w, height: h }} />;
  return (
    <div className="brasao" style={{ width: w, height: h }}>
      <img src={src} alt="" />
    </div>
  );
}

/* ========================================================================= */

export default function FolhaEscalaView({
  escala, brasoes, chefe, publicadoEm, publicadoPor,
}: {
  escala: any;
  brasoes?: Brasoes;
  chefe?: Chefe;
  publicadoEm?: string;
  publicadoPor?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [fator, setFator] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);   // null = ajustar à tela
  const [alturaCaixa, setAlturaCaixa] = useState(0);
  const [ass, setAss] = useState<{ chefe_p1?: Ass; cmt?: Ass }>({});
  const [chefeCfg, setChefeCfg] = useState<Chefe | null>(null);

  const data = String(escala?.data || "");
  // Publicações antigas podem não ter guardado quem assina — busca a config atual.
  const chefeEff = chefe || chefeCfg || undefined;

  useEffect(() => {
    if (chefe) return;
    let vivo = true;
    fetch("/api/escala-chefe")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setChefeCfg(d as Chefe); })
      .catch(() => { /* sai sem o nome do chefe */ });
    return () => { vivo = false; };
  }, [chefe]);

  /* assinatura avançada SIGEP desta escala (mesma referência do admin) */
  useEffect(() => {
    if (!data) { setAss({}); return; }
    let vivo = true;
    fetch(`/api/assinatura-sigep?tipo=escala&ref=${encodeURIComponent(data)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const m: { chefe_p1?: Ass; cmt?: Ass } = {};
        for (const a of d?.assinaturas || []) (m as any)[a.papel] = a;
        setAss(m);
      })
      .catch(() => { if (vivo) setAss({}); });
    return () => { vivo = false; };
  }, [data]);

  /* reduz a folha para caber na largura da tela (ou aplica o zoom escolhido) */
  const medir = useCallback(() => {
    const w = wrapRef.current?.clientWidth || 0;
    const p = paperRef.current;
    if (!w || !p) return;
    const cabe = Math.min(1, w / LARGURA_PAPEL);
    const f = zoom ?? cabe;
    setFator(f);
    setAlturaCaixa(p.offsetHeight * f);
  }, [zoom]);

  useLayoutEffect(() => {
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    if (ro && paperRef.current) ro.observe(paperRef.current);
    window.addEventListener("resize", medir);
    return () => { ro?.disconnect(); window.removeEventListener("resize", medir); };
  }, [medir, escala]);

  if (!escala) return null;

  const e = escala;
  const exp = e.expediente || {};
  const ehExtra = e.tipo === "extraordinaria";
  const ehJoe = e.tipo === "joe";
  const mostraExpediente = !ehFimDeSemana(data) && !ehExtra && !ehJoe;
  const expedienteFeriado = e.tipo !== "normal";
  const feriadoTexto = e.tipo === "facultativo"
    ? `PONTO FACULTATIVO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`
    : `FERIADO${e.feriadoLabel ? " (" + e.feriadoLabel + ")" : ""}`;
  const temObs = !!semTags(e.observacao || "");
  const reforco = (e.extraReforco || []).filter((r: any) => semTags(r?.postoGrad || "") || semTags(r?.nome || ""));
  const joeRows = e.joeRows || [];

  const cmtModo = chefeEff?.cmtModo || "sigep";
  const quandoPub = publicadoEm
    ? new Date(publicadoEm).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      })
    : "";

  const pct = Math.round(fator * 100);

  return (
    <div className="fev-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* controles — não saem na impressão */}
      <div className="fev-barra no-print">
        <span className="fev-info">
          {quandoPub ? <>Publicado em <b>{quandoPub}</b>{publicadoPor ? ` por ${publicadoPor}` : ""}</> : "Escala publicada"}
        </span>
        <div className="fev-zoom">
          <button onClick={() => setZoom(Math.max(0.4, (zoom ?? fator) - 0.15))} title="Diminuir"><Minus className="h-3.5 w-3.5" /></button>
          <span className="fev-pct">{pct}%</span>
          <button onClick={() => setZoom(Math.min(2.5, (zoom ?? fator) + 0.15))} title="Aumentar"><Plus className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom(null)} title="Ajustar à tela"><Maximize2 className="h-3.5 w-3.5" /></button>
          <button onClick={() => window.print()} title="Imprimir ou salvar em PDF"><Printer className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* a folha branca, reduzida para caber na tela */}
      <div className="fev-box" ref={wrapRef} style={{ height: alturaCaixa || undefined }}>
        <div className="fev-scale" style={{ transform: `scale(${fator})` }}>
          <div className={"doc-paper" + (ehJoe ? " landscape" : "")} ref={paperRef}>

            {/* Cabeçalho */}
            <div className="hdr">
              <div className="hdr-left"><Brasao src={brasoes?.pmma || BRASOES_PADRAO.pmma} w={92} h={72} /></div>
              <div className="hdr-center">
                <Brasao src={brasoes?.ma || BRASOES_PADRAO.ma} w={72} h={78} />
                <div className="orgtext">
                  {ORG_TEXTO.map((l, i) => <div key={i} className={i === 4 ? "org-strong" : ""}>{l}</div>)}
                </div>
              </div>
              <div className="hdr-right"><Brasao src={brasoes?.bpm || BRASOES_PADRAO.bpm} w={74} h={80} /></div>
            </div>

            <div className="titulo-wrap">
              <div className="visto-side">
                <div className="visto">VISTO</div>
                {ass.cmt ? (
                  <CarimboSigep nome={ass.cmt.nome} cargo="Cmt. do 18º BPM" data={data} largura="46mm" escala={0.8} assinatura={{ id: ass.cmt.id, token: ass.cmt.token }} />
                ) : cmtModo === "sigep" ? (
                  <CarimboSigep nome={chefeEff?.comandante || ""} cargo="Cmt. do 18º BPM" data={data} largura="46mm" escala={0.8} />
                ) : cmtModo === "gov" ? (
                  <div className="visto-esp" />
                ) : chefeEff?.cmtAssinatura ? (
                  <img className="visto-img" src={chefeEff.cmtAssinatura} alt="" />
                ) : <div className="visto-esp" />}
                <div className="hdr-left-cargo">Cmt. do 18º BPM</div>
              </div>
              <div className="titulo">{(ehExtra || ehJoe) ? "ESCALA DE SERVIÇO EXTRAORDINÁRIA" : "ESCALA DE SERVIÇO"}</div>
            </div>
            <div className="subt">PARA O DIA {extensoUpper(data)} ({diaSemana(data)})</div>

            {/* Extraordinária / JOE */}
            {(ehExtra || ehJoe) && (
              <div className="extra">
                <div className="extra-campos">
                  {e.extraOperacao && <div className="extra-linha"><span className="extra-lbl">OPERAÇÃO:</span> <T html={e.extraOperacao} /></div>}
                  {e.extraCmtOperacao && <div className="extra-linha"><span className="extra-lbl">CMT DA OPERAÇÃO:</span> <T html={e.extraCmtOperacao} /></div>}
                  {e.extraLocal && <div className="extra-linha"><span className="extra-lbl">LOCAL:</span> <T html={e.extraLocal} /></div>}
                  {e.extraHorario && <div className="extra-linha"><span className="extra-lbl">HORÁRIO:</span> <T html={e.extraHorario} /></div>}
                  {e.extraUniforme && <div className="extra-linha"><span className="extra-lbl">UNIFORME:</span> <T html={e.extraUniforme} /></div>}
                </div>

                {ehExtra && reforco.length > 0 && (
                  <table className="tbl reforco-tbl"><tbody>
                    <tr><td className="hd" colSpan={3}>REFORÇO SEDE</td></tr>
                    <tr>
                      <td className="lbl reforco-ord">ORD</td>
                      <td className="lbl">POST/GRAD</td>
                      <td className="lbl">NOME</td>
                    </tr>
                    {reforco.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="reforco-ord">{String(i + 1).padStart(2, "0")}</td>
                        <td className="val-c"><T html={r?.postoGrad} /></td>
                        <td className="val-c"><T html={r?.nome} /></td>
                      </tr>
                    ))}
                  </tbody></table>
                )}

                {ehJoe && joeRows.length > 0 && (
                  <table className="tbl joe-esc-tbl"><tbody>
                    <tr>
                      <td className="lbl joe-c-ord">Nº</td>
                      <td className="lbl">NOME COMPLETO</td>
                      <td className="lbl joe-c-id">ID</td>
                      <td className="lbl joe-c-cpf">CPF</td>
                      <td className="lbl">LOCAL DE EMPREGO</td>
                      <td className="lbl">HORÁRIO DA JORNADA</td>
                      <td className="lbl">FUNÇÃO DESEMPENHADA</td>
                    </tr>
                    {joeRows.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="joe-c-ord">{String(i + 1).padStart(2, "0")}</td>
                        <td className="val-c"><T html={r?.nome} /></td>
                        <td className="val-c"><T html={r?.id} /></td>
                        <td className="val-c"><T html={r?.cpf} /></td>
                        <td className="val-c"><T html={r?.local} /></td>
                        <td className="val-c"><T html={r?.horario} /></td>
                        <td className="val-c"><T html={r?.funcao} /></td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </div>
            )}

            {/* EXPEDIENTE */}
            {mostraExpediente && (
              <table className="tbl"><tbody>
                <tr><td className="hd" colSpan={4}>EXPEDIENTE <T html={exp.horario} /></td></tr>
                {expedienteFeriado ? (
                  <>
                    <tr><td className="lbl">CMT</td><td className="val feriado" rowSpan={5}>{feriadoTexto}</td><td className="lbl">SUBCMT</td><td className="val feriado" rowSpan={5}>{feriadoTexto}</td></tr>
                    <tr><td className="lbl">CMT FT</td><td className="lbl">P4</td></tr>
                    <tr><td className="lbl">SUBCMT FT</td><td className="lbl"></td></tr>
                    <tr><td className="lbl">P1</td><td className="lbl">RONDA ESCOLAR</td></tr>
                    <tr><td className="lbl">P3</td><td className="lbl">PATRULHA MARIA DA PENHA</td></tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="lbl">CMT</td>
                      <td className="val val-c"><T html={exp.cmt} /></td>
                      <td className="lbl">SUBCMT</td>
                      <td className="val val-c"><T html={exp.subcmt} /></td>
                    </tr>
                    <tr>
                      <td className="lbl">CMT FT</td>
                      <td className="val val-c"><T html={exp.cmtFt} /></td>
                      <td className="lbl">P4</td>
                      <td className="val" rowSpan={2}><ListaTexto valor={exp.p4} center semPermuta /></td>
                    </tr>
                    <tr>
                      <td className="lbl">SUBCMT FT</td>
                      <td className="val val-c"><T html={exp.subcmtFt} /></td>
                    </tr>
                    <tr>
                      <td className="lbl">P1</td>
                      <td className="val"><ListaTexto valor={exp.p1} center semPermuta /></td>
                      <td className="lbl">RONDA ESCOLAR</td>
                      <td className="val"><ListaTexto valor={exp.rondaEscolar} center semPermuta /></td>
                    </tr>
                    <tr>
                      <td className="lbl">P3</td>
                      <td className="val"><ListaTexto valor={exp.p3} center semPermuta /></td>
                      <td className="lbl">PATRULHA MARIA DA PENHA</td>
                      <td className="val"><ListaTexto valor={exp.patrulha} center semPermuta /></td>
                    </tr>
                  </>
                )}
                {semTags(e.obsExpediente || "") && (
                  <tr><td className="obs-sec" colSpan={4}><b>OBS:</b> <T html={e.obsExpediente} /></td></tr>
                )}
              </tbody></table>
            )}

            {!ehExtra && !ehJoe && (
              <>
                <table className="tbl mt"><tbody>
                  <tr><td className="lbl w-cpu">CPU DE DIA</td><td className="val"><SlotTexto slot={e.cpuDeDia || {}} /></td></tr>
                  <ObsSecao texto={e.obsCpu} />

                  <tr><td className="hd" colSpan={2}>GUARDA DO QUARTEL</td></tr>
                  <tr><td className="lbl w-cpu">PERMANENTE</td><td className="val"><ListaTexto valor={e.guardaPermanente} /></td></tr>
                  <ObsSecao texto={e.obsGuarda} />

                  <tr><td className="hd" colSpan={2}>RÁDIO PATRULHA</td></tr>
                  <tr><td className="lbl w-cpu">ADJUNTO DE DIA</td><td className="val"><SlotTexto slot={e.rpAdjunto || {}} /></td></tr>
                  <tr><td className="lbl w-cpu">MOTORISTA</td><td className="val"><SlotTexto slot={e.rpMotorista || {}} /></td></tr>
                  <tr><td className="lbl w-cpu">PATRULHEIRO</td><td className="val"><ListaTexto valor={e.rpPatrulheiro} /></td></tr>
                  <ObsSecao texto={e.obsRp} />

                  <tr><td className="hd" colSpan={2}>SERVIÇO DE INTELIGÊNCIA 24 HRS</td></tr>
                  <tr><td className="val" colSpan={2}><ListaTexto valor={e.inteligencia} centro /></td></tr>
                  <ObsSecao texto={e.obsInteligencia} />

                  <tr><td className="hd" colSpan={2}>FORÇA TÁTICA</td></tr>
                  <tr><td className="lbl w-cpu">GRADUADO</td><td className="val"><SlotTexto slot={e.ftGraduado || {}} /></td></tr>
                  <tr><td className="lbl w-cpu">MOTORISTA</td><td className="val"><SlotTexto slot={e.ftMotorista || {}} /></td></tr>
                  <tr><td className="lbl w-cpu">PATRULHEIRO</td><td className="val"><ListaTexto valor={e.ftPatrulheiro} /></td></tr>
                  <ObsSecao texto={e.obsFt} />

                  <tr><td className="hd" colSpan={2}>ROTEM</td></tr>
                  <tr>
                    <td className="lbl w-cpu rotem-h">{(e.rotemHorarios || []).filter(Boolean).map((h: string, i: number) => <div key={i}>{h}</div>)}</td>
                    <td className="val"><ListaTexto valor={e.rotemMilitares} /></td>
                  </tr>
                  <ObsSecao texto={e.obsRotem} />
                </tbody></table>

                {temObs && (
                  <div className="obs-rodape">
                    <span className="obs-lbl">OBSERVAÇÃO:</span> <T html={e.observacao} />
                  </div>
                )}

                <div className="rodape-local">
                  Quartel do 18º BPM, em Presidente Dutra-MA, {extensoLow(e.dataConfeccao || data)}.
                </div>
              </>
            )}

            <div className="assinatura">
              {ass.chefe_p1 ? (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>
                  <CarimboSigep nome={ass.chefe_p1.nome} cargo={ass.chefe_p1.cargo} data={data} largura="80mm" assinatura={{ id: ass.chefe_p1.id, token: ass.chefe_p1.token }} />
                </div>
              ) : chefeEff?.assinarGov ? (
                <div className="ass-gov-espaco" />
              ) : chefeEff?.assinatura ? (
                <img className="ass-img" src={chefeEff.assinatura} alt="" />
              ) : <div className="ass-gov-espaco" />}
              <div className="ass-nome">{chefeEff?.nome || ""}</div>
              <div className="ass-funcao">{chefeEff?.funcao || ""}</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== CSS ==============================
   Mesmo desenho da folha do administrador, escopado em .fev-root para
   não vazar para o resto do app. */
const CSS = `
.fev-root{ }
.fev-barra{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
  background:#0F1B2D; border:1px solid #1d2c44; border-radius:12px 12px 0 0; padding:8px 12px; }
.fev-info{ font-size:11px; color:#94A3B8; } .fev-info b{ color:#cdd9ea; }
.fev-zoom{ display:flex; align-items:center; gap:4px; }
.fev-zoom button{ display:inline-flex; align-items:center; justify-content:center;
  width:28px; height:28px; border-radius:8px; border:1px solid #2b3f63; background:#16243a; color:#cdd9ea; cursor:pointer; }
.fev-zoom button:hover{ border-color:#D4AF37; color:#fff; }
.fev-pct{ min-width:42px; text-align:center; font-size:11px; color:#94A3B8; }

.fev-box{ overflow:auto; background:#0a1424; border:1px solid #1d2c44; border-top:0;
  border-radius:0 0 12px 12px; padding:10px; }
.fev-scale{ transform-origin:top left; width:max-content; }

.fev-root .doc-paper{ background:#fff; color:#000; width:210mm; padding:8mm 14mm;
  box-shadow:0 10px 40px rgba(0,0,0,.5); font-family:"Times New Roman", Georgia, serif; line-height:1.1; }
.fev-root .doc-paper.landscape{ width:297mm; }

.fev-root .hdr{ display:flex; gap:6px; align-items:flex-start; }
.fev-root .hdr-left{ width:122px; text-align:center; font-size:11px; display:flex; flex-direction:column; align-items:center; }
.fev-root .hdr-right{ width:92px; display:flex; justify-content:center; align-items:flex-start; }
.fev-root .visto{ font-weight:700; }
.fev-root .visto-img{ max-width:118px; max-height:44px; object-fit:contain; display:block; margin:0 auto; }
.fev-root .visto-esp{ height:44px; }
.fev-root .hdr-left-cargo{ font-weight:700; margin-top:2px; }
.fev-root .titulo-wrap{ position:relative; }
.fev-root .visto-side{ position:absolute; left:0; bottom:0; width:122px; text-align:center; font-size:11px; line-height:1.15; }
.fev-root .hdr-center{ flex:1; text-align:center; display:flex; flex-direction:column; align-items:center; }
.fev-root .orgtext{ font-size:13.5px; margin-top:4px; } .fev-root .orgtext .org-strong{ font-weight:700; }
.fev-root .brasao{ display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto; }
.fev-root .brasao img{ max-width:100%; max-height:100%; object-fit:contain; }

.fev-root .titulo{ text-align:center; font-weight:700; font-size:27px; text-decoration:underline; margin-top:6px; }
.fev-root .subt{ text-align:center; font-weight:700; font-size:17px; text-decoration:underline; margin-top:4px; }

.fev-root .tbl{ width:100%; border-collapse:collapse; table-layout:fixed; }
.fev-root .tbl.mt{ margin-top:2px; }
.fev-root .tbl td{ border:1px solid #000; padding:2px 6px; font-size:15px; vertical-align:top; }
.fev-root .tbl .hd{ text-align:center; font-weight:700; }
.fev-root .tbl .lbl{ font-weight:700; text-align:center; vertical-align:middle; }
.fev-root .tbl .val{ font-style:italic; }
.fev-root .tbl .val-c{ font-style:italic; text-align:center; vertical-align:middle; }
.fev-root .tbl .feriado{ text-align:center; font-style:italic; font-weight:700; vertical-align:middle; }
.fev-root .w-cpu{ width:30%; }
.fev-root .rotem-h{ font-style:italic; font-weight:700; vertical-align:middle; }
.fev-root .tbl td.obs-sec{ font-size:12.5px; font-style:italic; padding:1px 6px; line-height:1.2; }
.fev-root .tbl td.obs-sec b{ font-style:normal; font-size:11.5px; }

.fev-root .extra{ margin-top:8px; }
.fev-root .extra-campos{ margin:8px 0 10px; }
.fev-root .extra-linha{ font-size:15px; margin:4px 0; }
.fev-root .extra-lbl{ font-weight:700; }
.fev-root .reforco-tbl{ margin-top:2px; }
.fev-root .reforco-ord{ width:12%; text-align:center; font-weight:700; vertical-align:middle; font-style:normal; }
.fev-root .joe-esc-tbl td{ font-size:12.5px; }
.fev-root .joe-c-ord{ width:5%; text-align:center; font-weight:700; vertical-align:middle; font-style:normal; }
.fev-root .joe-c-id{ width:9%; }
.fev-root .joe-c-cpf{ width:13%; }

.fev-root .lista{ display:flex; flex-direction:column; gap:1px; }
.fev-root .lista.center{ align-items:flex-start; text-align:left; }
.fev-root .lista.centro{ align-items:center; text-align:center; }
.fev-root .lista.centro .linha{ justify-content:center; }
.fev-root .linha{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:flex-start; }
.fev-root .slot{ display:inline; } .fev-root .perm{ font-weight:700; }

.fev-root .rodape-local{ text-align:center; font-size:15px; margin-top:10px; }
.fev-root .obs-rodape{ margin-top:8px; font-size:14px; text-align:left; line-height:1.3; }
.fev-root .obs-rodape .obs-lbl{ font-weight:bold; }
.fev-root .assinatura{ text-align:center; margin-top:14px; }
.fev-root .ass-img{ max-height:50px; max-width:240px; object-fit:contain; display:block; margin:0 auto 2px; }
.fev-root .ass-gov-espaco{ height:50px; }
.fev-root .ass-nome{ font-weight:700; font-size:15px; } .fev-root .ass-funcao{ font-size:15px; }

/* Imprimir / salvar em PDF: sai só a folha, no tamanho natural. */
@media print{
  @page{ size:A4; margin:6mm; }
  body{ background:#fff !important; }
  body *{ visibility:hidden !important; }
  .fev-root .doc-paper, .fev-root .doc-paper *{ visibility:visible !important; }
  .fev-root .fev-box{ height:auto !important; overflow:visible !important; border:0 !important; padding:0 !important; background:#fff !important; }
  .fev-root .fev-scale{ transform:none !important; width:auto !important; }
  .fev-root .doc-paper{ position:absolute; left:0; top:0; width:100% !important; max-width:none !important;
    box-shadow:none !important; padding:0 !important; }
  .fev-root .tbl tr, .fev-root .tbl td{ page-break-inside:avoid; }
  .no-print{ display:none !important; }
}
`;
