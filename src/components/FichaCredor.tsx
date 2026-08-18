"use client";

import { useMemo, useState } from "react";
import { Printer, Save, Loader2, RotateCcw } from "lucide-react";
import { classificarPatente } from "@/lib/patentes";
import { BuscaMilitar, Campo, Cabecalho, ESTILO_FOLHA, FOLHA_A4, type Militar } from "@/components/diarias/Comum";

/* FICHA DE CADASTRO DE CREDOR (área de Diárias)

   Folha branca igual ao documento oficial. O militar entra pelo buscador e a
   ficha nasce preenchida com o que ja existe no cadastro do efetivo (CPF,
   endereco, bairro, cidade, telefone, banco, agencia, conta) — nao ha nada
   para redigitar quando o cadastro esta completo.

   Os campos sao editaveis na folha. "Salvar no cadastro" devolve as correcoes
   para a ficha do militar, entao o dado so precisa ser acertado uma vez.

   A ficha NAO e guardada: como todo dado vem do cadastro, ela pode ser gerada
   de novo a qualquer momento, identica. */

// Campos atomicos da ficha, que existem 1-para-1 no cadastro do efetivo e por
// isso podem voltar para la. O NOME fica de fora de proposito: ele e montado a
// partir de posto + numero/barra + nome, entao nao da para desmontar de volta.
type Campos = {
  matricula: string; cpf: string;
  endereco: string; bairro: string; cidade: string; telefone: string;
  banco: string; agencia: string; conta: string;
};

const VAZIO: Campos = {
  matricula: "", cpf: "", endereco: "", bairro: "", cidade: "",
  telefone: "", banco: "", agencia: "", conta: "",
};

// "SOLDADO PM N°775/17 JOSUÉ SILVA LIMA" — posto por extenso, em caixa alta,
// como no documento original.
export function nomeCredor(m: { postoGrad?: string | null; numeroBarra?: string | null; nome?: string | null }): string {
  const posto = classificarPatente(m.postoGrad ?? "").rotulo;
  const barra = (m.numeroBarra || "").trim();
  return [posto && posto !== "Não informado" ? `${posto} PM` : "", barra ? `N°${barra}` : "", m.nome || ""]
    .filter(Boolean).join(" ").toUpperCase();
}

export default function FichaCredor() {
  const [sel, setSel] = useState<Militar | null>(null);
  const [nome, setNome] = useState("");
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [original, setOriginal] = useState<Campos>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  // Escolher o militar puxa a ficha COMPLETA (a lista do buscador nao traz
  // endereco nem dados bancarios) e preenche a folha.
  const escolher = async (m: Militar) => {
    setMsg(""); setCarregando(true);
    try {
      const r = await fetch(`/api/efetivo/${encodeURIComponent(m.id)}`);
      const f = r.ok ? await r.json() : {};
      const c: Campos = {
        matricula: f.matricula || "", cpf: f.cpf || "",
        endereco: f.endereco || "", bairro: f.bairro || "", cidade: f.cidade || "",
        telefone: f.telefone || "", banco: f.banco || "", agencia: f.agencia || "",
        conta: f.conta || "",
      };
      setSel(m); setNome(nomeCredor({ ...m, ...f })); setCampos(c); setOriginal(c);
    } catch { setMsg("Falha ao carregar a ficha do militar."); }
    finally { setCarregando(false); }
  };

  const limpar = () => { setSel(null); setCampos(VAZIO); setOriginal(VAZIO); setNome(""); setMsg(""); };
  const set = (k: keyof Campos) => (v: string) => setCampos((c) => ({ ...c, [k]: v }));

  // So mandamos o que a auxiliar realmente mudou, para nao carimbar o cadastro
  // inteiro a cada ficha impressa.
  const mudados = useMemo(
    () => (Object.keys(campos) as (keyof Campos)[]).filter((k) => campos[k].trim() !== original[k].trim()),
    [campos, original]
  );

  const salvar = async () => {
    if (!sel || !mudados.length) return;
    setSalvando(true); setMsg("");
    try {
      const corpo: Record<string, string> = {};
      for (const k of mudados) corpo[k] = campos[k].trim();
      const r = await fetch(`/api/efetivo/${encodeURIComponent(sel.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d?.erro || "Falha ao salvar no cadastro."); return; }
      setOriginal(campos);
      setMsg(`✅ ${mudados.length} campo(s) atualizados no cadastro do militar.`);
    } catch { setMsg("Falha ao salvar no cadastro."); }
    finally { setSalvando(false); }
  };

  return (
    <>
      {/* ----- barra de comando (não sai na impressão) ----- */}
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 print:hidden">
        <BuscaMilitar sel={sel} onEscolher={escolher} onLimpar={limpar} rotulo="Militar (credor)" />

        {sel && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button onClick={salvar} disabled={salvando || !mudados.length}
              title={mudados.length ? `Grava ${mudados.length} campo(s) na Ficha Individual do militar` : "Nada foi alterado"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mudados.length ? `Salvar ${mudados.length} correção(ões) no cadastro` : "Nada a salvar no cadastro"}
            </button>
            {mudados.length > 0 && (
              <button onClick={() => setCampos(original)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#94A3B8] transition hover:text-white">
                <RotateCcw className="h-4 w-4" /> Desfazer
              </button>
            )}
            {msg && <span className="text-xs text-[#94A3B8]">{msg}</span>}
          </div>
        )}
        {!sel && <p className="mt-2 text-xs text-[#94A3B8]">Busque o militar e a ficha sai preenchida com os dados do cadastro. Dá para ajustar qualquer campo na folha antes de imprimir.</p>}
      </div>

      {carregando && <p className="text-center text-sm text-[#94A3B8] print:hidden">Carregando a ficha...</p>}

      {/* ----- a folha ----- */}
      {sel && !carregando && (
        // key: ao trocar de militar a folha remonta, senão os campos
        // contentEditable guardariam o texto do militar anterior.
        <div key={sel.id} className="folha-diaria mx-auto bg-white text-black shadow-2xl print:shadow-none" style={FOLHA_A4}>
          {/* moldura: o documento original é uma tabela de borda fina em volta de tudo */}
          <div style={{ border: "0.5pt solid #000", padding: "4mm 5mm" }}>
            <Cabecalho />

            <p style={{ textAlign: "center", fontSize: "16pt", fontWeight: "bold", margin: "6mm 0 5mm" }}>
              FICHA DE CADASTRO DE CREDOR
            </p>

            <p style={sSecao}>DADOS PESSOAIS</p>
            <p style={sLinha}><b>NOME:</b> <Campo valor={nome} onChange={setNome} min="120mm" /></p>
            <p style={sLinha}>
              <b>MATRÍCULA:</b> <Campo valor={campos.matricula} onChange={set("matricula")} min="35mm" />
              <span style={{ display: "inline-block", width: "10mm" }} />
              <b>CPF:</b> <Campo valor={campos.cpf} onChange={set("cpf")} min="45mm" />
            </p>
            <p style={sLinha}>
              <b>ENDEREÇO:</b> <Campo valor={campos.endereco} onChange={set("endereco")} min="70mm" />
              <span style={{ display: "inline-block", width: "6mm" }} />
              <b>BAIRRO:</b> <Campo valor={campos.bairro} onChange={set("bairro")} min="45mm" />
            </p>
            <p style={sLinha}>
              <b>CIDADE:</b> <Campo valor={campos.cidade} onChange={set("cidade")} min="70mm" />
              <span style={{ display: "inline-block", width: "6mm" }} />
              <b>TELEFONE:</b> <Campo valor={campos.telefone} onChange={set("telefone")} min="45mm" />
            </p>

            <p style={{ ...sSecao, marginTop: "6mm" }}>DADOS BANCÁRIOS</p>
            <p style={sLinha}><b>BANCO:</b> <Campo valor={campos.banco} onChange={set("banco")} min="90mm" /></p>
            <p style={sLinha}><b>AGÊNCIA:</b> <Campo valor={campos.agencia} onChange={set("agencia")} min="90mm" /></p>
            <p style={sLinha}><b>CONTA CORRENTE:</b> <Campo valor={campos.conta} onChange={set("conta")} min="90mm" /></p>

            <div style={{ marginTop: "30mm", textAlign: "center" }}>
              <p style={{ margin: 0 }}>{nome || " "}</p>
              <p style={{ margin: 0, fontWeight: "bold" }}>CREDOR</p>
            </div>
          </div>
        </div>
      )}

      <style>{ESTILO_FOLHA}</style>
    </>
  );
}

const sSecao: React.CSSProperties = { fontWeight: "bold", margin: "0 0 2mm" };
const sLinha: React.CSSProperties = { margin: "0 0 2.5mm" };
