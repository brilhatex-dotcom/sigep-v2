"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Search, Save, Loader2, RotateCcw } from "lucide-react";
import { classificarPatente } from "@/lib/patentes";

/* FICHA DE CADASTRO DE CREDOR (área de Diárias)

   Folha branca igual ao documento oficial. O militar entra pelo buscador e a
   ficha nasce preenchida com o que ja existe no cadastro do efetivo (CPF,
   endereco, bairro, cidade, telefone, banco, agencia, conta) — nao ha nada
   para redigitar quando o cadastro esta completo.

   Os campos sao editaveis na folha. "Salvar no cadastro" devolve as correcoes
   para a ficha do militar, entao o dado so precisa ser acertado uma vez.

   A ficha NAO e guardada: como todo dado vem do cadastro, ela pode ser gerada
   de novo a qualquer momento, identica. */

type Militar = {
  id: string;
  postoGrad?: string | null;
  numeroBarra?: string | null;
  nome?: string | null;
  nomeGuerra?: string | null;
  matricula?: string | null;
};

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
function nomeCredor(m: { postoGrad?: string | null; numeroBarra?: string | null; nome?: string | null }): string {
  const posto = classificarPatente(m.postoGrad ?? "").rotulo;
  const barra = (m.numeroBarra || "").trim();
  return [posto && posto !== "Não informado" ? `${posto} PM` : "", barra ? `N°${barra}` : "", m.nome || ""]
    .filter(Boolean).join(" ").toUpperCase();
}

function nomeBusca(m: Militar) {
  return [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ");
}

export default function FichaCredor() {
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Militar | null>(null);
  const [nome, setNome] = useState("");
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [original, setOriginal] = useState<Campos>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as Militar[])).catch(() => {});
  }, []);

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return efetivo.filter((m) =>
      (nomeBusca(m) + " " + (m.nome || "") + " " + (m.matricula || "")).toLowerCase().includes(t)
    ).slice(0, 8);
  }, [busca, efetivo]);

  // Escolher o militar puxa a ficha COMPLETA (a lista do buscador nao traz
  // endereco nem dados bancarios) e preenche a folha.
  const escolher = async (m: Militar) => {
    setBusca(""); setMsg(""); setCarregando(true);
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
        <label className="mb-1 block text-xs text-[#94A3B8]">Militar (credor)</label>
        {sel ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">{nomeBusca(sel)}{sel.matricula ? ` · mat ${sel.matricula}` : ""}</span>
            <button onClick={() => { setSel(null); setCampos(VAZIO); setOriginal(VAZIO); setNome(""); setMsg(""); }}
              className="text-xs text-[#94A3B8] underline hover:text-white">trocar militar</button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar militar por nome ou matrícula..."
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            {busca.trim() !== "" && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1626] shadow-xl">
                {resultados.length === 0 ? <div className="px-3 py-2 text-xs text-[#94A3B8]">Nenhum militar.</div> :
                  resultados.map((m) => (
                    <button key={m.id} onClick={() => escolher(m)} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                      {nomeBusca(m)} {m.matricula && <span className="text-xs text-[#94A3B8]">mat {m.matricula}</span>}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

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
        <div key={sel.id} id="ficha-credor" className="mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.4 }}>
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
              <p style={{ margin: 0 }}>{nome || " "}</p>
              <p style={{ margin: 0, fontWeight: "bold" }}>CREDOR</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .campo-ed:empty:before { content: "\\00a0"; }
        .campo-ed:hover, .campo-ed:focus { background: #fdf6da; outline: none; }
        @media print {
          .campo-ed { background: transparent !important; }
          #ficha-credor { margin: 0 !important; width: 100% !important; min-height: 0 !important; padding: 8mm 10mm !important; box-shadow: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </>
  );
}

/* Campo editavel direto na folha: some a borda na impressao, entao o documento
   sai limpo. Nao guarda HTML — so o texto — porque o valor pode voltar para o
   cadastro do militar. */
function Campo({ valor, onChange, min }: { valor: string; onChange: (v: string) => void; min?: string }) {
  return (
    <span
      className="campo-ed"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{ display: "inline-block", minWidth: min || "30mm", borderBottom: "0.5pt dotted #bbb" }}
      onBlur={(e) => onChange((e.currentTarget.textContent || "").trim())}
    >
      {valor}
    </span>
  );
}

function Cabecalho() {
  const esconde = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.visibility = "hidden"; };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
        <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "24mm", height: "20mm", objectFit: "contain" }} onError={esconde} />
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.15 }}>
          <img src="/brasoes/armas-ma.png" alt="" style={{ height: "14mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={esconde} />
          <p style={{ margin: 0 }}>ESTADO DO MARANHÃO</p>
          <p style={{ margin: 0 }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
          <p style={{ margin: 0 }}>POLÍCIA MILITAR DO MARANHÃO</p>
          <p style={{ margin: 0 }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
          <p style={{ margin: 0 }}>18º BATALHÃO DE POLICIA MILITAR</p>
        </div>
        <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={esconde} />
      </div>
      <p style={{ textAlign: "center", fontSize: "9pt", margin: "1mm 0 0", lineHeight: 1.2 }}>
        Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />
        <b>TELEFAX: (99) 98497-1918(Permanência) – 18batalhaopmma@gmail.com</b>
      </p>
    </>
  );
}

const sSecao: React.CSSProperties = { fontWeight: "bold", margin: "0 0 2mm" };
const sLinha: React.CSSProperties = { margin: "0 0 2.5mm" };
