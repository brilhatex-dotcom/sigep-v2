"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Save, Loader2, Plus, Trash2, Pencil, Check } from "lucide-react";
import CarimboSigep from "@/components/CarimboSigep";
import { BuscaMilitar, Campo, Cabecalho, ESTILO_FOLHA, FOLHA_A4, type Militar } from "@/components/diarias/Comum";

/* FICHA DE CONTROLE INDIVIDUAL DE DIÁRIAS (área de Diárias)

   É o REGISTRO DO ANO: as viagens do policial vão se acumulando ao longo do
   exercicio e a ficha mostra o historico daquele ano, com o total somado. Cada
   viagem guarda o ano a que pertence, entao trocar de ano abre o historico
   daquele exercicio sem misturar com os outros.

   Cabecalho e dados pessoais saem do cadastro do efetivo. As viagens (BG/Nota,
   processo, trajeto, periodo, qtd) sao gravadas por militar e por ano, porque
   nao existem em nenhum outro lugar do sistema.

   A assinatura do Comandante sai EM BRANCO por padrao, com a opcao de carimbo
   da avancada SIGEP ou de reservar o espaco para assinar no Gov.br — mesmo
   mecanismo dos memorandos. */

type Viagem = { id: string; bgNota: string; processo: string; trajeto: string; periodo: string; qtd: string };
type Pessoais = { nome: string; matricula: string; idPm: string; cpf: string; lotacao: string };
type ModoAss = "branco" | "sigep" | "gov";

const PESSOAIS_VAZIO: Pessoais = { nome: "", matricula: "", idPm: "", cpf: "", lotacao: "" };

function novaViagem(): Viagem {
  return { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, bgNota: "", processo: "", trajeto: "", periodo: "", qtd: "" };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPorExtenso(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function FichaControleIndividual() {
  const anoAtual = String(new Date().getFullYear());
  const [sel, setSel] = useState<Militar | null>(null);
  const [ano, setAno] = useState(anoAtual);
  const [anosComRegistro, setAnosComRegistro] = useState<string[]>([]);
  const [pes, setPes] = useState<Pessoais>(PESSOAIS_VAZIO);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [cidadeData, setCidadeData] = useState(`PRESIDENTE DUTRA – MA, ${dataPorExtenso()}`);
  const [comandante, setComandante] = useState("TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS");
  const [modoAss, setModoAss] = useState<ModoAss>("branco");
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  // Nome do Comandante: mesma fonte dos memorandos (config da Escala), então a
  // ficha acompanha se o comando mudar.
  useEffect(() => {
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.comandante) setComandante(String(d.comandante)); })
      .catch(() => {});
  }, []);

  // Carrega as viagens do militar no ano escolhido. Roda ao escolher o militar
  // e ao trocar de ano.
  const carregarViagens = async (idPmma: string, anoAlvo: string) => {
    const r = await fetch(`/api/diarias/viagens?idPmma=${encodeURIComponent(idPmma)}&ano=${encodeURIComponent(anoAlvo)}`);
    const d = r.ok ? await r.json() : {};
    const lista: Viagem[] = Array.isArray(d?.viagens) ? d.viagens : [];
    setAnosComRegistro(Array.isArray(d?.anos) ? d.anos : []);
    setViagens(lista.length ? lista : [novaViagem()]);
  };

  const escolher = async (m: Militar) => {
    setMsg(""); setCarregando(true); setEditando(false);
    try {
      const rf = await fetch(`/api/efetivo/${encodeURIComponent(m.id)}`);
      const f = rf.ok ? await rf.json() : {};
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
      await carregarViagens(m.id, ano);
    } catch { setMsg("Falha ao carregar a ficha do militar."); }
    finally { setCarregando(false); }
  };

  const trocarAno = async (novo: string) => {
    setAno(novo); setMsg("");
    if (!sel) return;
    setCarregando(true);
    try { await carregarViagens(sel.id, novo); }
    catch { setMsg("Falha ao carregar o ano."); }
    finally { setCarregando(false); }
  };

  const limpar = () => { setSel(null); setPes(PESSOAIS_VAZIO); setViagens([]); setAnosComRegistro([]); setMsg(""); setEditando(false); };
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
        body: JSON.stringify({ idPmma: sel.id, ano, viagens: uteis }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d?.error || "Falha ao salvar as viagens."); return; }
      setAnosComRegistro((a) => (a.includes(ano) ? a : [ano, ...a].sort().reverse()));
      setMsg(`✅ ${uteis.length} viagem(ns) gravadas no exercício ${ano}.`);
    } catch { setMsg("Falha ao salvar as viagens."); }
    finally { setSalvando(false); }
  };

  // Anos oferecidos: os que já têm registro + o atual e o anterior.
  const anosOpcoes = useMemo(() => {
    const base = new Set([...anosComRegistro, anoAtual, String(Number(anoAtual) - 1), ano]);
    return Array.from(base).filter(Boolean).sort().reverse();
  }, [anosComRegistro, anoAtual, ano]);

  const BotaoAss = ({ id, rotulo }: { id: ModoAss; rotulo: string }) => (
    <button onClick={() => setModoAss(id)}
      className={`rounded px-2 py-1 text-xs transition ${modoAss === id ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/10 text-[#94A3B8] hover:text-white"}`}>
      {rotulo}
    </button>
  );

  return (
    <>
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 print:hidden">
        <BuscaMilitar sel={sel} onEscolher={escolher} onLimpar={limpar} rotulo="Militar" />

        {sel && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-[#94A3B8]">Exercício</label>
              <select value={ano} onChange={(e) => trocarAno(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50">
                {anosOpcoes.map((a) => (
                  <option key={a} value={a}>{a}{anosComRegistro.includes(a) ? " ✓" : ""}</option>
                ))}
              </select>
              <span className="text-xs text-[#94A3B8]">
                {anosComRegistro.length ? `com registro: ${anosComRegistro.join(", ")}` : "sem registro anterior"}
              </span>
            </div>

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
              <button onClick={() => setEditando((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition ${editando ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                {editando ? <><Check className="h-4 w-4" /> Pronto</> : <><Pencil className="h-4 w-4" /> Editar</>}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#94A3B8]">Assinatura do Comandante:</span>
              <BotaoAss id="branco" rotulo="Em branco" />
              <BotaoAss id="sigep" rotulo="Carimbo SIGEP" />
              <BotaoAss id="gov" rotulo="Espaço p/ Gov.br" />
            </div>

            {editando && (
              <p className="mt-2 text-xs text-amber-300">
                Modo edição: dá para mexer em qualquer parte do documento (rótulos, títulos, cabeçalho).
                As viagens e os dados pessoais continuam sendo salvos normalmente; o resto vale só para esta impressão.
              </p>
            )}
            {msg && <p className="mt-2 text-xs text-[#94A3B8]">{msg}</p>}
          </>
        )}
        {!sel && <p className="mt-2 text-xs text-[#94A3B8]">Busque o militar. Os dados pessoais vêm do cadastro; as viagens ficam gravadas por exercício e formam o histórico do policial.</p>}
      </div>

      {carregando && <p className="text-center text-sm text-[#94A3B8] print:hidden">Carregando a ficha...</p>}

      {sel && !carregando && (
        <div
          key={`${sel.id}-${ano}`}
          className="folha-diaria mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{ ...FOLHA_A4, outline: editando ? "2px solid #f59e0b" : "none" }}
          contentEditable={editando}
          suppressContentEditableWarning
        >
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

          {/* ----- DADOS DA VIAGEM (exercício selecionado) ----- */}
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
                  <td style={sCelD}><Campo valor={v.bgNota} onChange={setV(i, "bgNota")} min="100%" /></td>
                  <td style={sCelD}><Campo valor={v.processo} onChange={setV(i, "processo")} min="100%" /></td>
                  <td style={sCelD}><Campo valor={v.trajeto} onChange={setV(i, "trajeto")} min="100%" /></td>
                  <td style={sCelD}><Campo valor={v.periodo} onChange={setV(i, "periodo")} min="100%" /></td>
                  <td style={{ ...sCelD, textAlign: "center", position: "relative" }}>
                    <Campo valor={v.qtd} onChange={setV(i, "qtd")} min="12mm" negrito centro />
                    {viagens.length > 1 && (
                      <button
                        className="print:hidden"
                        title="remover esta viagem"
                        contentEditable={false}
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

          {/* Assinatura do Cmt: em branco por padrão; carimbo da avançada SIGEP
              ou espaço reservado para assinar depois no Gov.br. */}
          <div style={{ textAlign: "center", marginTop: "6mm" }}>
            {modoAss === "sigep" ? (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
                <CarimboSigep nome={comandante} cargo="Cmt. do 18º BPM" largura="52mm" />
              </div>
            ) : (
              // "branco" e "gov" reservam a mesma altura: no Gov.br a assinatura
              // é aplicada depois, no PDF, e precisa desse espaço livre.
              <div style={{ height: modoAss === "gov" ? "22mm" : "16mm" }} />
            )}
            <p style={{ margin: 0, fontWeight: "bold" }}>{comandante}</p>
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
