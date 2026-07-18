"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { type Cadastro, assignDia, construirIdDe, toISO, parseISO } from "@/lib/escalaMotor";

/* Folha SEMANAL de RÁDIO PATRULHA da UNIDADE (interior). A escala dos
   destacamentos sai a semana inteira (segunda a domingo), diferente da sede
   (que continua diária). Reaproveita o motor da escala (escopado à unidade e
   já ciente do padrão "3 por 6" etc.) e gera uma folha A4 imprimível — sem
   tocar na escala da sede. Assinaturas do Cmt e do Sargenteante em branco. */

type Militar = { id: string; postoGrad?: string; numeroBarra?: string; nome?: string; nomeGuerra?: string; matricula?: string };
type Brasoes = { pmma: string; ma: string; bpm: string };

const DSEM = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MES =["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const DAY = 86400000;
// segunda-feira da semana que contém `iso`
function segundaDaSemana(iso: string): string {
  const dt = parseISO(iso);
  const dow = dt.getDay();            // 0=dom .. 6=sáb
  const recuo = (dow + 6) % 7;        // dias desde a última segunda
  return toISO(new Date(dt.getTime() - recuo * DAY));
}
function somaDias(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY));
}
function brData(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${y}` : iso;
}
function periodoExtenso(seg: string, dom: string): string {
  const [ , m1, d1] = seg.split("-");
  const [y2, m2, d2] = dom.split("-");
  return `${d1} de ${MES[Number(m1) - 1]} a ${d2} de ${MES[Number(m2) - 1]} de ${y2}`;
}
function abrev(p?: string): string {
  const map: Record<string, string> = {
    "coronel": "Cel", "tenente-coronel": "Ten Cel", "major": "Maj", "capitão": "Cap", "capitao": "Cap",
    "1º tenente": "1º Ten", "2º tenente": "2º Ten", "aspirante a oficial": "Asp Of", "subtenente": "ST",
    "1º sargento": "1º Sgt", "2º sargento": "2º Sgt", "3º sargento": "3º Sgt", "cabo": "Cb", "soldado": "Sd",
  };
  return map[(p || "").trim().toLowerCase()] ?? (p || "").trim();
}

export default function FolhaUnidadeRp({
  cad, efetivo, rotuloUnidade, escopo, onFechar,
}: {
  cad: Cadastro;
  efetivo: Militar[];
  rotuloUnidade: string;
  escopo: string;
  onFechar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const [segISO, setSegISO] = useState(segundaDaSemana(toISO(new Date())));
  const [brasoes, setBrasoes] = useState<Brasoes>({ pmma: "/brasoes/pmma-190.jpg", ma: "/brasao-estado-ma.png", bpm: "/brasoes/brasao-18bpm.png" });
  const [publicando, setPublicando] = useState(false);
  const [msg, setMsg] = useState("");
  const [publicadas, setPublicadas] = useState<{ id: string; dataEscala: string; publicadoEm: string }[]>([]);
  useEffect(() => { setMontado(true); }, []);
  useEffect(() => {
    fetch(`/api/escala-brasoes?escopo=${encodeURIComponent(escopo)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.brasoes) setBrasoes(d.brasoes); }).catch(() => {});
  }, [escopo]);
  const carregarPublicadas = () => {
    fetch(`/api/publicacoes?escopo=${encodeURIComponent(escopo)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.publicacoes)) setPublicadas(d.publicacoes); }).catch(() => {});
  };
  useEffect(() => { carregarPublicadas(); /* eslint-disable-next-line */ }, [escopo]);

  const nomeDe = useMemo(() => {
    const idx = new Map<string, Militar>(efetivo.map((m) => [m.id, m]));
    return (id: string) => {
      const m = idx.get(id);
      if (!m) return id || "—";
      const posto = abrev(m.postoGrad);
      const barra = (m.numeroBarra || "").trim();
      const guerra = (m.nomeGuerra || (m.nome || "").split(/\s+/).slice(-1)[0] || "").trim();
      return [posto, barra ? "nº " + barra : "", guerra].filter(Boolean).join(" ").trim() || id;
    };
  }, [efetivo]);

  const idDe = useMemo(() => construirIdDe(efetivo), [efetivo]);
  const linha = (ids: string[]) => (ids && ids.length ? ids.map(nomeDe).join(" · ") : "—");

  // 7 dias da semana (segunda→domingo), cada um com a previsão de RP.
  const domISO = somaDias(segISO, 6);
  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = somaDias(segISO, i);
      const a = assignDia(iso, cad, {}, idDe);
      return {
        iso, dow: parseISO(iso).getDay(),
        adjunto: linha(a.rpAdjunto), motorista: linha(a.rpMotorista), patrulheiro: linha(a.rpPatrulheiro),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segISO, cad, idDe]);

  const publicar = async () => {
    setPublicando(true); setMsg("");
    try {
      const escala = {
        semanaInicio: segISO, semanaFim: domISO, tipo: "rp_unidade_semana", rotuloUnidade,
        dias: dias.map((d) => ({ iso: d.iso, adjunto: d.adjunto, motorista: d.motorista, patrulheiro: d.patrulheiro })),
      };
      const r = await fetch(`/api/publicacoes?escopo=${encodeURIComponent(escopo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escala, brasoes }),
      });
      if (!r.ok) throw new Error();
      setMsg("Escala da semana publicada no arquivo da unidade. ✅");
      carregarPublicadas();
    } catch { setMsg("Não foi possível publicar."); }
    finally { setPublicando(false); }
  };

  if (!montado || typeof document === "undefined") return null;

  return createPortal((
    <div id="folha-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0b1626] px-3 py-2 shadow">
        <label className="mr-auto flex items-center gap-2 text-sm text-white">
          Semana de:
          <input type="date" value={segISO} onChange={(e) => setSegISO(segundaDaSemana(e.target.value || toISO(new Date())))}
            className="rounded-md border border-white/15 bg-[#0a1626] px-2 py-1 text-sm text-white" />
          <span className="text-xs text-[#94A3B8]">{brData(segISO)} → {brData(domISO)}</span>
        </label>
        <button onClick={() => setSegISO(somaDias(segISO, -7))} className="rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/5">← Semana anterior</button>
        <button onClick={() => setSegISO(somaDias(segISO, 7))} className="rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/5">Próxima semana →</button>
        {publicadas.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value) setSegISO(segundaDaSemana(e.target.value)); }}
            className="rounded-md border border-white/15 bg-[#0a1626] px-2 py-1 text-sm text-white" title="Semanas publicadas da unidade">
            <option value="">Publicadas ({publicadas.length})…</option>
            {publicadas.map((p) => <option key={p.id} value={p.dataEscala}>Semana de {brData(p.dataEscala)}</option>)}
          </select>
        )}
        <button onClick={publicar} disabled={publicando} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">📢 {publicando ? "Publicando…" : "Publicar semana"}</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
      </div>
      {msg && <div className="no-print bg-[#0b1626] px-3 pb-2 text-xs text-emerald-300">{msg}</div>}

      <div id="folha-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 16mm", fontFamily: "Times New Roman, Times, serif", fontSize: "11pt", lineHeight: 1.35, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
          <img src={brasoes.pmma} alt="" style={{ width: "26mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
            <img src={brasoes.ma} alt="" style={{ height: "16mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
            <p style={{ margin: "1mm 0 0", fontWeight: "bold" }}>{rotuloUnidade.toUpperCase()}</p>
          </div>
          <img src={brasoes.bpm} alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 1mm" }}>ESCALA SEMANAL DE SERVIÇO — RÁDIO PATRULHA</h1>
        <p style={{ textAlign: "center", margin: "0 0 6mm" }}>Semana de {periodoExtenso(segISO, domISO)}</p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #000", padding: "2mm 2mm", background: "#e8e8e8", width: "34mm" }}>DIA</th>
              <th style={{ border: "1px solid #000", padding: "2mm 2mm", background: "#e8e8e8" }}>ADJUNTO</th>
              <th style={{ border: "1px solid #000", padding: "2mm 2mm", background: "#e8e8e8" }}>MOTORISTA</th>
              <th style={{ border: "1px solid #000", padding: "2mm 2mm", background: "#e8e8e8" }}>PATRULHEIRO</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.iso} style={{ background: (d.dow === 0 || d.dow === 6) ? "#f6f6f6" : "#fff" }}>
                <td style={{ border: "1px solid #000", padding: "2.5mm 2mm", fontWeight: "bold" }}>
                  {DSEM[d.dow]}<br /><span style={{ fontWeight: "normal", fontSize: "9pt" }}>{brData(d.iso)}</span>
                </td>
                <td style={{ border: "1px solid #000", padding: "2.5mm 2mm" }}>{d.adjunto}</td>
                <td style={{ border: "1px solid #000", padding: "2.5mm 2mm" }}>{d.motorista}</td>
                <td style={{ border: "1px solid #000", padding: "2.5mm 2mm" }}>{d.patrulheiro}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: "9pt", fontStyle: "italic", color: "#555", margin: "3mm 0 0" }}>
          Previsão gerada pelo SIGEP conforme o rodízio da unidade{cad.padraoEscala ? ` (padrão: ${cad.padraoEscala})` : ""}. Confira antes de publicar.
        </p>

        <div style={{ display: "flex", justifyContent: "space-around", marginTop: "22mm", textAlign: "center" }}>
          <div style={{ width: "70mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>Sargenteante da Unidade</div>
          </div>
          <div style={{ width: "70mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>Comandante da Unidade</div>
          </div>
        </div>
      </div>

      <style>{`@media print { body > *:not(#folha-overlay){display:none!important;} #folha-overlay{position:static!important;overflow:visible!important;background:#fff!important;inset:auto!important;display:block!important;} .no-print{display:none!important;} #folha-print{position:static!important;margin:0 auto!important;box-shadow:none!important;min-height:0!important;width:100%!important;padding:12mm 14mm!important;} html,body{margin:0!important;padding:0!important;background:#fff!important;} @page{size:A4;margin:0;} }`}</style>
    </div>
  ), document.body);
}
