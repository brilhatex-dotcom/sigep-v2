"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { type Cadastro, assignDia, construirIdDe, toISO } from "@/lib/escalaMotor";

/* Folha diária de RÁDIO PATRULHA da UNIDADE (interior). Reaproveita o motor da
   escala (escopado à unidade) e gera uma folha A4 imprimível — sem tocar na
   escala da sede. Assinaturas do Cmt e do Sargenteante da unidade em branco
   (padrão de assinatura será definido depois). */

type Militar = { id: string; postoGrad?: string; numeroBarra?: string; nome?: string; nomeGuerra?: string; matricula?: string };
type Brasoes = { pmma: string; ma: string; bpm: string };

const DSEM = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function extenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DSEM[dt.getDay()]}, ${String(d).padStart(2, "0")} de ${MES[m - 1]} de ${y}`;
}
function brData(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${y}` : iso;
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
  const [data, setData] = useState(toISO(new Date()));
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

  const assign = useMemo(() => assignDia(data, cad, {}, construirIdDe(efetivo)), [data, cad, efetivo]);
  const linha = (ids: string[]) => (ids && ids.length ? ids.map(nomeDe).join(" · ") : "—");

  const publicar = async () => {
    setPublicando(true); setMsg("");
    try {
      const escala = {
        data, tipo: "rp_unidade", rotuloUnidade,
        rp: { adjunto: linha(assign.rpAdjunto), motorista: linha(assign.rpMotorista), patrulheiro: linha(assign.rpPatrulheiro) },
      };
      const r = await fetch(`/api/publicacoes?escopo=${encodeURIComponent(escopo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escala, brasoes }),
      });
      if (!r.ok) throw new Error();
      setMsg("Folha publicada no arquivo da unidade. ✅");
      carregarPublicadas();
    } catch { setMsg("Não foi possível publicar."); }
    finally { setPublicando(false); }
  };

  if (!montado || typeof document === "undefined") return null;

  return createPortal((
    <div id="folha-overlay" className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 bg-[#0b1626] px-3 py-2 shadow">
        <label className="mr-auto flex items-center gap-2 text-sm text-white">
          Dia:
          <input type="date" value={data} onChange={(e) => setData(e.target.value || toISO(new Date()))}
            className="rounded-md border border-white/15 bg-[#0a1626] px-2 py-1 text-sm text-white" />
        </label>
        {publicadas.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value) setData(e.target.value); }}
            className="rounded-md border border-white/15 bg-[#0a1626] px-2 py-1 text-sm text-white" title="Folhas publicadas da unidade">
            <option value="">Publicadas ({publicadas.length})…</option>
            {publicadas.map((p) => <option key={p.id} value={p.dataEscala}>{brData(p.dataEscala)}</option>)}
          </select>
        )}
        <button onClick={publicar} disabled={publicando} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">📢 {publicando ? "Publicando…" : "Publicar"}</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
      </div>
      {msg && <div className="no-print bg-[#0b1626] px-3 pb-2 text-xs text-emerald-300">{msg}</div>}

      <div id="folha-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 18mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.4, position: "relative" }}>
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

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "8mm 0 1mm" }}>ESCALA DE SERVIÇO — RÁDIO PATRULHA</h1>
        <p style={{ textAlign: "center", margin: "0 0 6mm" }}>{extenso(data)}</p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12pt" }}>
          <tbody>
            {[
              ["ADJUNTO", assign.rpAdjunto],
              ["MOTORISTA", assign.rpMotorista],
              ["PATRULHEIRO", assign.rpPatrulheiro],
            ].map(([rot, ids]) => (
              <tr key={rot as string}>
                <td style={{ border: "1px solid #000", padding: "3mm 4mm", width: "42mm", fontWeight: "bold", background: "#f2f2f2" }}>{rot as string}</td>
                <td style={{ border: "1px solid #000", padding: "3mm 4mm" }}>{linha(ids as string[])}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: "9pt", fontStyle: "italic", color: "#555", margin: "3mm 0 0" }}>
          Previsão gerada pelo SIGEP conforme o rodízio da unidade. Confira antes de publicar.
        </p>

        <div style={{ display: "flex", justifyContent: "space-around", marginTop: "26mm", textAlign: "center" }}>
          <div style={{ width: "70mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>Sargenteante da Unidade</div>
          </div>
          <div style={{ width: "70mm" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>Comandante da Unidade</div>
          </div>
        </div>
      </div>

      <style>{`@media print { body > *:not(#folha-overlay){display:none!important;} #folha-overlay{position:static!important;overflow:visible!important;background:#fff!important;inset:auto!important;display:block!important;} .no-print{display:none!important;} #folha-print{position:static!important;margin:0 auto!important;box-shadow:none!important;min-height:0!important;width:100%!important;padding:12mm 16mm!important;} html,body{margin:0!important;padding:0!important;background:#fff!important;} @page{size:A4;margin:0;} }`}</style>
    </div>
  ), document.body);
}
