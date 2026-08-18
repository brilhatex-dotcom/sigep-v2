"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { BuscaMilitar, Campo, Cabecalho, ESTILO_FOLHA, FOLHA_A4, type Militar } from "@/components/diarias/Comum";

/* FICHA DE CONTROLE INDIVIDUAL DE DIÁRIAS (área de Diárias)

   Cabecalho e DADOS PESSOAIS saem do cadastro do efetivo, como na Ficha de
   Credor. A diferenca esta na tabela DADOS DA VIAGEM: BG/Nota, processo,
   trajeto, periodo e quantidade de diarias — dados que NAO existem em nenhum
   outro lugar do sistema.

   Por isso as viagens SAO gravadas (Config "diarias_viagens", por militar):
   sem isso a ficha se perderia ao fechar a tela e nao haveria controle nenhum.
   O TOTAL e somado das linhas, nao digitado.

   O nome do Comandante e a assinatura vem da configuracao da Escala (a mesma
   fonte dos memorandos), entao a ficha acompanha quando o comando mudar. */

type Viagem = { id: string; bgNota: string; processo: string; trajeto: string; periodo: string; qtd: string };
type Pessoais = { nome: string; matricula: string; idPm: string; cpf: string; lotacao: string };

const PESSOAIS_VAZIO: Pessoais = { nome: "", matricula: "", idPm: "", cpf: "", lotacao: "" };

function novaViagem(): Viagem {
  return { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, bgNota: "", processo: "", trajeto: "", periodo: "", qtd: "" };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPorExtenso(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function FichaControleIndividual() {
  const [sel, setSel] = useState<Militar | null>(null);
  const [pes, setPes] = useState<Pessoais>(PESSOAIS_VAZIO);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [cidadeData, setCidadeData] = useState(`PRESIDENTE DUTRA – MA, ${dataPorExtenso()}`);
  const [cmt, setCmt] = useState({ nome: "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS", assinatura: "/brasoes/assinatura-cmt.png" });
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  // Comandante que assina: mesma fonte dos memorandos (config da Escala).
  useEffect(() => {
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCmt({
          nome: String(d.comandante || "TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS"),
          assinatura: String(d.cmtAssinatura || "/brasoes/assinatura-cmt.png"),
        });
      }).catch(() => {});
  }, []);

  const escolher = async (m: Militar) => {
    setMsg(""); setCarregando(true);
    try {
      const [rf, rv] = await Promise.all([
        fetch(`/api/efetivo/${encodeURIComponent(m.id)}`),
        fetch(`/api/diarias/viagens?idPmma=${encodeURIComponent(m.id)}`),
      ]);
      const f = rf.ok ? await rf.json() : {};
      const dv = rv.ok ? await rv.json() : {};
      setSel(m);
      setPes({
        // No documento original o nome vem SEM posto, só o nome civil.
        nome: String(f.nome || "").toUpperCase(),
        matricula: f.matricula || "",
        // "ID" do documento: usamos o ID_PMMA, que é o número do militar no
        // sistema. Editável, caso a seção use outra numeração.
        idPm: m.id || "",
        cpf: f.cpf || "",
        lotacao: f.lotacao || "18º BPM",
      });
      const lista: Viagem[] = Array.isArray(dv?.viagens) ? dv.viagens : [];
      setViagens(lista.length ? lista : [novaViagem()]);
    } catch { setMsg("Falha ao carregar a ficha do militar."); }
    finally { setCarregando(false); }
  };

  const limpar = () => { setSel(null); setPes(PESSOAIS_VAZIO); setViagens([]); setMsg(""); };
  const setP = (k: keyof Pessoais) => (v: string) => setPes((p) => ({ ...p, [k]: v }));
  const setV = (i: number, k: keyof Viagem) => (v: string) =>
    setViagens((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  // TOTAL somado das linhas — nunca digitado. Aceita "02", "2", "1,5".
  const total = useMemo(() => {
    const soma = viagens.reduce((acc, v) => {
      const n = parseFloat((v.qtd || "").replace(",", "."));
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    if (!soma) return "-";
    return Number.isInteger(soma) ? String(soma).padStart(2, "0") : soma.toFixed(1).replace(".", ",");
  }, [viagens]);

  const salvar = async () => {
    if (!sel) return;
    setSalvando(true); setMsg("");
    try {
      // Linha totalmente vazia não vale a pena guardar.
      const uteis = viagens.filter((v) => [v.bgNota, v.processo, v.trajeto, v.periodo, v.qtd].some((x) => (x || "").trim()));
      const r = await fetch("/api/diarias/viagens", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: sel.id, viagens: uteis }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d?.error || "Falha ao salvar as viagens."); return; }
      setMsg(`✅ ${uteis.length} viagem(ns) gravadas para este militar.`);
    } catch { setMsg("Falha ao salvar as viagens."); }
    finally { setSalvando(false); }
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 print:hidden">
        <BuscaMilitar sel={sel} onEscolher={escolher} onLimpar={limpar} rotulo="Militar" />

        {sel && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button onClick={() => setViagens((l) => [...l, novaViagem()])} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-1.5 text-sm text-[#D4AF37] transition hover:bg-[#D4AF37]/10">
              <Plus className="h-4 w-4" /> Nova viagem
            </button>
            <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar viagens
            </button>
            {msg && <span className="text-xs text-[#94A3B8]">{msg}</span>}
          </div>
        )}
        {!sel && <p className="mt-2 text-xs text-[#94A3B8]">Busque o militar. Os dados pessoais vêm do cadastro; as viagens ficam gravadas para este militar e voltam na próxima vez.</p>}
      </div>

      {carregando && <p className="text-center text-sm text-[#94A3B8] print:hidden">Carregando a ficha...</p>}

      {sel && !carregando && (
        <div key={sel.id} className="folha-diaria mx-auto bg-white text-black shadow-2xl print:shadow-none" style={FOLHA_A4}>
          <Cabecalho />

          <p style={{ textAlign: "center", fontSize: "14pt", fontWeight: "bold", margin: "6mm 0 5mm" }}>
            FICHA DE CONTROLE INDIVIDUAL DE DIÁRIAS
          </p>

          <p style={sSecao}>DADOS PESSOAIS</p>
          <p style={sLinha}><b>NOME:</b> <Campo valor={pes.nome} onChange={setP("nome")} min="120mm" /></p>
          <p style={sLinha}>
            <b>MATRÍCULA:</b> <Campo valor={pes.matricula} onChange={setP("matricula")} min="30mm" />
            <span style={{ display: "inline-block", width: "6mm" }} />
            <b>ID:</b> <Campo valor={pes.idPm} onChange={setP("idPm")} min="28mm" />
            <span style={{ display: "inline-block", width: "6mm" }} />
            <b>CPF:</b> <Campo valor={pes.cpf} onChange={setP("cpf")} min="42mm" />
          </p>
          <p style={sLinha}><b>LOTAÇÃO:</b> <Campo valor={pes.lotacao} onChange={setP("lotacao")} min="70mm" /></p>

          {/* ----- DADOS DA VIAGEM ----- */}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "5mm 0 0", fontSize: "11pt" }}>
            <thead>
              <tr>
                <th colSpan={5} style={{ ...sCel, fontWeight: "bold", textAlign: "center" }}>DADOS DA VIAGEM</th>
              </tr>
              <tr>
                <th style={{ ...sCel, width: "26%" }}>BG/NOTA Nº</th>
                <th style={{ ...sCel, width: "22%" }}>PROCESSO Nº</th>
                <th style={{ ...sCel, width: "21%" }}>TRAJETO</th>
                <th style={{ ...sCel, width: "18%" }}>PERÍODO</th>
                <th style={{ ...sCel, width: "13%" }}>QTD DE DIÁRIAS</th>
              </tr>
            </thead>
            <tbody>
              {viagens.map((v, i) => (
                <tr key={v.id}>
                  <td style={sCelD}>
                    <Campo valor={v.bgNota} onChange={setV(i, "bgNota")} min="100%" />
                  </td>
                  <td style={sCelD}><Campo valor={v.processo} onChange={setV(i, "processo")} min="100%" /></td>
                  <td style={sCelD}><Campo valor={v.trajeto} onChange={setV(i, "trajeto")} min="100%" /></td>
                  <td style={sCelD}><Campo valor={v.periodo} onChange={setV(i, "periodo")} min="100%" /></td>
                  <td style={{ ...sCelD, textAlign: "center", position: "relative" }}>
                    <Campo valor={v.qtd} onChange={setV(i, "qtd")} min="12mm" negrito centro />
                    {viagens.length > 1 && (
                      <button
                        className="print:hidden"
                        title="remover esta viagem"
                        onClick={() => setViagens((l) => l.filter((_, j) => j !== i))}
                        style={{ position: "absolute", right: "-7mm", top: "50%", transform: "translateY(-50%)", color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}
                      >
                        <Trash2 style={{ width: "3.5mm", height: "3.5mm" }} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ ...sCel, textAlign: "right", fontWeight: "bold" }}>TOTAL</td>
                <td style={{ ...sCel, textAlign: "center", fontWeight: "bold" }}>{total}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ textAlign: "center", margin: "10mm 0 0" }}>
            <Campo valor={cidadeData} onChange={setCidadeData} min="100mm" centro />
          </p>

          <div style={{ textAlign: "center", marginTop: "6mm" }}>
            <img src={cmt.assinatura} alt="" style={{ height: "18mm", objectFit: "contain", display: "block", margin: "0 auto" }}
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <p style={{ margin: 0, fontWeight: "bold" }}>{cmt.nome}</p>
            <p style={{ margin: 0, fontWeight: "bold" }}>CMT. DO 18º BPM</p>
          </div>
        </div>
      )}

      <style>{ESTILO_FOLHA}</style>
    </>
  );
}

const sSecao: React.CSSProperties = { fontWeight: "bold", margin: "0 0 2mm" };
const sLinha: React.CSSProperties = { margin: "0 0 2.5mm" };
const sCel: React.CSSProperties = { border: "0.5pt solid #000", padding: "1.2mm 1.5mm", fontWeight: "bold" };
const sCelD: React.CSSProperties = { border: "0.5pt solid #000", padding: "1.2mm 1.5mm", verticalAlign: "top" };
