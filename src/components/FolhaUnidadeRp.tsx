"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { type Cadastro, assignDia, construirIdDe, toISO, parseISO } from "@/lib/escalaMotor";
import { padronizarBrasao } from "@/lib/imagem";
import { imprimirElemento } from "@/lib/imprimir";

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
  cad, efetivo, rotuloUnidade, cidadeUnidade = "", escopo, onFechar,
}: {
  cad: Cadastro;
  efetivo: Militar[];
  rotuloUnidade: string;
  cidadeUnidade?: string;
  escopo: string;
  onFechar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const [segISO, setSegISO] = useState(segundaDaSemana(toISO(new Date())));
  const [brasoes, setBrasoes] = useState<Brasoes>({ pmma: "/brasoes/pmma-190.jpg", ma: "/brasao-estado-ma.png", bpm: "/brasoes/brasao-18bpm.png" });
  const [publicando, setPublicando] = useState(false);
  const [msg, setMsg] = useState("");
  const [publicadas, setPublicadas] = useState<{ id: string; dataEscala: string; publicadoEm: string; status?: string; aprovadoPor?: string | null }[]>([]);
  // Comando do lugar: a assinatura de baixo é SEMPRE o Cmt local.
  const [cmt, setCmt] = useState<{ nome: string; cargo: string; assinatura: string; assinarGov: boolean }>({ nome: "", cargo: `Comandante do ${rotuloUnidade}`, assinatura: "", assinarGov: false });
  const [papel, setPapel] = useState<"admin" | "cmt" | "sarg" | null>(null);
  const [temSarg, setTemSarg] = useState(false);
  const podeAssinar = papel === "admin" || papel === "cmt";
  useEffect(() => { setMontado(true); }, []);
  useEffect(() => {
    fetch(`/api/escala-brasoes?escopo=${encodeURIComponent(escopo)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.brasoes) setBrasoes(d.brasoes); }).catch(() => {});
  }, [escopo]);
  const carregarComando = () => {
    fetch(`/api/escala-comando?escopo=${encodeURIComponent(escopo)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      if (d.cmt) setCmt({ nome: d.cmt.nome || "", cargo: d.cmt.cargo || `Comandante do ${rotuloUnidade}`, assinatura: d.cmt.assinatura || "", assinarGov: !!d.cmt.assinarGov });
      setPapel(d.papel ?? null);
      setTemSarg(!!d.temSargenteante);
    }).catch(() => {});
  };
  useEffect(() => { carregarComando(); /* eslint-disable-next-line */ }, [escopo]);
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

  // Título do cabeçalho com o nome EXPRESSO da cidade. Ex.: "3ª CIA DOM PEDRO -
  // MA". Quando o rótulo já traz a cidade (ex.: "2º Pel. Governador Archer"),
  // só acrescenta a UF ("... - MA") em vez de repetir a cidade.
  const tituloUnidade = useMemo(() => {
    const semAcento = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const rot = (rotuloUnidade || "").trim();
    const cid = (cidadeUnidade || "").trim();
    if (!cid) return rot.toUpperCase();
    const uf = (cid.match(/-\s*([A-Za-zÀ-ÿ]{2})\s*$/)?.[1] || "").toUpperCase();
    const cidSemUf = cid.replace(/\s*-\s*[A-Za-zÀ-ÿ]{2}\s*$/, "").trim();
    if (cidSemUf && semAcento(rot).includes(semAcento(cidSemUf))) {
      return (uf ? `${rot} - ${uf}` : rot).toUpperCase();
    }
    return `${rot} ${cid}`.toUpperCase();
  }, [rotuloUnidade, cidadeUnidade]);

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
        // `data` = segunda da semana (chave do registro); guarda a semana inteira.
        data: segISO, semanaInicio: segISO, semanaFim: domISO, tipo: "rp_unidade_semana", rotuloUnidade,
        dias: dias.map((d) => ({ iso: d.iso, adjunto: d.adjunto, motorista: d.motorista, patrulheiro: d.patrulheiro })),
        cmt: { nome: cmt.nome, cargo: cmt.cargo, assinatura: cmt.assinarGov ? "" : cmt.assinatura, assinarGov: cmt.assinarGov },
      };
      const r = await fetch(`/api/publicacoes?escopo=${encodeURIComponent(escopo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escala, brasoes }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => ({}));
      setMsg(d?.status === "pendente"
        ? "Escala enviada ao Cmt para aprovação. ⏳"
        : "Escala da semana publicada e autorizada. ✅");
      carregarPublicadas();
    } catch { setMsg("Não foi possível publicar."); }
    finally { setPublicando(false); }
  };

  // Cmt/admin: aprovar uma semana enviada pelo sargenteante.
  const aprovar = async (id: string) => {
    setMsg("");
    try {
      const r = await fetch(`/api/publicacoes?escopo=${encodeURIComponent(escopo)}&id=${encodeURIComponent(id)}&acao=aprovar`, { method: "PATCH" });
      if (!r.ok) throw new Error();
      setMsg("Escala autorizada. ✅");
      carregarPublicadas();
    } catch { setMsg("Não foi possível aprovar."); }
  };

  // Cmt/admin: subir a imagem da assinatura (ou marcar "assinar via Gov.br").
  const salvarAssinatura = async (novo: { assinatura: string; assinarGov: boolean }) => {
    setCmt((c) => ({ ...c, ...novo }));
    try {
      await fetch(`/api/escala-comando?escopo=${encodeURIComponent(escopo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novo),
      });
    } catch { /* silencioso */ }
  };
  const pickAssinatura = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => salvarAssinatura({ assinatura: String(r.result), assinarGov: false });
      r.readAsDataURL(f);
    };
    inp.click();
  };

  const pendentes = publicadas.filter((p) => (p.status || "autorizada") === "pendente");

  // Clicar num brasão do cabeçalho → subir a logo da unidade. A imagem é
  // padronizada pelo molde da sede (mesma proporção, sem distorcer) e salva no
  // banco escopada a esta unidade — reflete em todos os PCs da unidade.
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const pickBrasao = (chave: "pmma" | "ma" | "bpm") => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        setSalvandoLogo(true); setMsg("");
        try {
          const padr = await padronizarBrasao(chave, String(r.result));
          const novo = { ...brasoes, [chave]: padr };
          setBrasoes(novo);
          await fetch(`/api/escala-brasoes?escopo=${encodeURIComponent(escopo)}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brasoes: novo }),
          });
          setMsg("Logo da unidade atualizada. ✅");
        } catch { setMsg("Não foi possível salvar a logo."); }
        finally { setSalvandoLogo(false); }
      };
      r.readAsDataURL(f);
    };
    inp.click();
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
            {publicadas.map((p) => <option key={p.id} value={p.dataEscala}>Semana de {brData(p.dataEscala)} {(p.status || "autorizada") === "pendente" ? "⏳ pendente" : "✅"}</option>)}
          </select>
        )}
        {podeAssinar && (
          <button onClick={pickAssinatura} className="rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/5" title="Assinatura do Cmt na folha">✍ Assinatura do Cmt</button>
        )}
        <button onClick={publicar} disabled={publicando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
          📢 {publicando ? "Enviando…" : (papel === "sarg" ? "Enviar ao Cmt" : "Publicar semana")}
        </button>
        <button onClick={() => imprimirElemento(document.getElementById("folha-print"), { titulo: `Escala ${rotuloUnidade}` })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"><X className="h-4 w-4" /> Fechar</button>
      </div>
      {/* Cmt/admin: semanas enviadas pelo sargenteante aguardando aprovação */}
      {podeAssinar && pendentes.length > 0 && (
        <div className="no-print bg-[#1a1206] px-3 py-2 text-xs text-amber-200">
          <b>Aguardando sua aprovação ({pendentes.length}):</b>
          <span className="ml-2 inline-flex flex-wrap gap-2 align-middle">
            {pendentes.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5">
                Semana de {brData(p.dataEscala)}
                <button onClick={() => aprovar(p.id)} className="ml-1 rounded bg-emerald-700 px-1.5 py-0.5 text-white hover:bg-emerald-800">Aprovar</button>
              </span>
            ))}
          </span>
        </div>
      )}
      {papel === "sarg" && (
        <div className="no-print bg-[#0b1626] px-3 pb-1 text-xs text-[#94A3B8]">Você é o sargenteante: ao publicar, a escala vai para o Cmt local aprovar. A assinatura de baixo é sempre do Cmt.</div>
      )}
      {msg && <div className="no-print bg-[#0b1626] px-3 pb-2 text-xs text-emerald-300">{msg}</div>}

      <div id="folha-print" className="mx-auto my-6 bg-white text-black shadow-2xl print:my-0 print:shadow-none"
        style={{ width: "210mm", minHeight: "297mm", padding: "12mm 16mm", fontFamily: "Times New Roman, Times, serif", fontSize: "11pt", lineHeight: 1.3, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
          <img src={brasoes.pmma} alt="" title="Clique para trocar a logo (esquerda)" onClick={() => pickBrasao("pmma")}
            className="brasao-troca" style={{ width: "26mm", height: "22mm", objectFit: "contain", cursor: "pointer" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
            <img src={brasoes.ma} alt="" title="Clique para trocar a logo (centro)" onClick={() => pickBrasao("ma")}
              className="brasao-troca" style={{ height: "16mm", objectFit: "contain", display: "block", margin: "0 auto 1mm", cursor: "pointer" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>ESTADO DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>POLÍCIA MILITAR DO MARANHÃO</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>18º BATALHÃO DE POLÍCIA MILITAR</p>
            <p style={{ margin: "1mm 0 0", fontWeight: "bold" }}>{tituloUnidade}</p>
          </div>
          <img src={brasoes.bpm} alt="" title="Clique para trocar a logo da unidade (direita)" onClick={() => pickBrasao("bpm")}
            className="brasao-troca" style={{ width: "22mm", height: "22mm", objectFit: "contain", cursor: "pointer" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
        </div>
        <p className="no-print" style={{ textAlign: "center", fontSize: "8pt", color: "#888", margin: "1mm 0 0" }}>
          {salvandoLogo ? "Salvando logo…" : "Dica: clique em qualquer brasão do cabeçalho para enviar a logo da unidade (o tamanho é padronizado automaticamente)."}
        </p>

        <h1 style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", margin: "5mm 0 1mm" }}>ESCALA SEMANAL DE SERVIÇO — RÁDIO PATRULHA</h1>
        <p style={{ textAlign: "center", margin: "0 0 4mm" }}>Semana de {periodoExtenso(segISO, domISO)}</p>

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

        {/* Assinatura única = Cmt local (como o Chefe do P/1 na sede). Imagem
            se enviada; em branco quando for assinar via Gov.br ou ainda não. */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "14mm", textAlign: "center" }}>
          <div style={{ width: "90mm" }}>
            <div style={{ height: "16mm", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              {cmt.assinatura && !cmt.assinarGov
                ? <img src={cmt.assinatura} alt="assinatura do Cmt" style={{ maxHeight: "16mm", maxWidth: "80mm", objectFit: "contain" }} />
                : null}
            </div>
            <div style={{ borderTop: "1px solid #000", paddingTop: "1mm" }}>
              {cmt.nome && <p style={{ margin: 0, fontWeight: "bold" }}>{cmt.nome}</p>}
              <p style={{ margin: 0 }}>{cmt.cargo}</p>
              {cmt.assinarGov && <p className="no-print" style={{ margin: "1mm 0 0", fontSize: "8pt", color: "#888" }}>(assinatura digital via Gov.br)</p>}
            </div>
          </div>
        </div>
      </div>

      {podeAssinar && (
        <div className="no-print mx-auto mb-8 max-w-[210mm] px-4 text-xs text-[#94A3B8]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cmt.assinarGov} onChange={(e) => salvarAssinatura({ assinatura: cmt.assinatura, assinarGov: e.target.checked })} />
            Sair <b>em branco</b> para eu assinar via Gov.br (não usar a imagem)
          </label>
          {cmt.assinatura && (
            <button onClick={() => salvarAssinatura({ assinatura: "", assinarGov: cmt.assinarGov })} className="mt-1 rounded border border-white/15 px-2 py-0.5 text-white hover:bg-white/5">🗑 Remover imagem da assinatura</button>
          )}
        </div>
      )}

      <style>{`.brasao-troca{border-radius:4px;transition:outline .1s;} .brasao-troca:hover{outline:2px dashed #2e6b48;outline-offset:2px;} @media print {
        /* Vence a regra global de outras telas (ex.: o mapa faz body*{visibility:hidden}). */
        body *{ visibility:hidden !important; }
        #folha-overlay, #folha-overlay *{ visibility:visible !important; }
        .brasao-troca{outline:none!important;}
        body > *:not(#folha-overlay){display:none!important;}
        #folha-overlay{position:static!important;overflow:visible!important;background:#fff!important;inset:auto!important;display:block!important;}
        .no-print{display:none!important;}
        #folha-print{position:static!important;margin:0 auto!important;box-shadow:none!important;min-height:0!important;width:100%!important;padding:12mm 14mm!important;}
        html,body{margin:0!important;padding:0!important;background:#fff!important;}
        @page{size:A4 portrait;margin:0;}
      } `}</style>
    </div>
  ), document.body);
}
