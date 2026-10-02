"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Save, Loader2, RotateCcw } from "lucide-react";
import { classificarPatente } from "@/lib/patentes";
import { BuscaMilitar, Campo, Cabecalho, ESTILO_FOLHA, FOLHA_A4, type Militar } from "@/components/docs/Comum";
import ListaFeitos, { dataBR, mesPorExtenso, type ItemFeito } from "@/components/docs/ListaFeitos";
import { confirmar } from "@/components/Avisos";

/* FICHA DE CADASTRO DE CREDOR (área de Diárias)

   Folha branca igual ao documento oficial. O militar entra pelo buscador e a
   ficha nasce preenchida com o que ja existe no cadastro do efetivo (CPF,
   endereco, bairro, cidade, telefone, banco, agencia, conta) — nao ha nada
   para redigitar quando o cadastro esta completo.

   Os campos sao editaveis na folha. "Salvar no cadastro" devolve as correcoes
   para a ficha do militar, entao o dado so precisa ser acertado uma vez.

   Cada ficha IMPRESSA entra na lista "Fichas de credor feitas", logo abaixo
   do buscador, com a cópia da folha como saiu (CPF e dados bancários
   cifrados, como no cadastro). "Abrir" põe a ficha de volta na tela, pronta
   para conferir ou reimprimir. */

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

/* Nome do credor, em caixa alta e com o posto por extenso, seguindo a mesma
   regra de identificacao que a Escala de Servico ja usa:

     praca   -> "SOLDADO PM N°775/17 JOSUÉ SILVA LIMA"
     oficial -> "1º TENENTE QOEM PAULO SILAS BARROS DE BRITO JÚNIOR"

   Oficial NAO tem numero/barra — so praca tem — e leva o QUADRO (QOEM, QOE...)
   no lugar de "PM". */
export function nomeCredor(m: {
  postoGrad?: string | null; numeroBarra?: string | null; nome?: string | null; quadro?: string | null;
}): string {
  const p = classificarPatente(m.postoGrad ?? "");
  const posto = p.rotulo !== "Não informado" ? p.rotulo : "";
  const ehOficial = p.ordem <= 7;
  const quadro = (m.quadro || "").trim().toUpperCase();
  const barra = (m.numeroBarra || "").trim();

  const meio = ehOficial ? (quadro || "PM") : "PM";
  const num = !ehOficial && /\d/.test(barra) ? `N°${barra}` : "";

  return [posto, posto ? meio : "", num, m.nome || ""].filter(Boolean).join(" ").toUpperCase();
}

export default function FichaCredor() {
  const [sel, setSel] = useState<Militar | null>(null);
  const [nome, setNome] = useState("");
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [original, setOriginal] = useState<Campos>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  // ---- fichas já feitas ----
  type Feita = { id: string; idPmma: string; postoGrad: string; nome: string; criadoEm: string; horario: string; criadoPor: string };
  const [feitas, setFeitas] = useState<Feita[]>([]);
  const [carregandoFeitas, setCarregandoFeitas] = useState(true);
  const [erroFeitas, setErroFeitas] = useState("");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  // muda a cada ficha aberta: a folha remonta (os campos editáveis guardam texto)
  const [versaoFolha, setVersaoFolha] = useState(0);

  const carregarFeitas = useCallback(async () => {
    setCarregandoFeitas(true); setErroFeitas("");
    try {
      const r = await fetch("/api/diarias/credores");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroFeitas(d?.error || "Falha ao carregar as fichas feitas."); return; }
      setFeitas(Array.isArray(d?.itens) ? d.itens : []);
    } catch { setErroFeitas("Falha ao carregar as fichas feitas."); }
    finally { setCarregandoFeitas(false); }
  }, []);
  useEffect(() => { carregarFeitas(); }, [carregarFeitas]);

  const itensFeitos: ItemFeito[] = feitas.map((f) => ({
    id: f.id,
    grupo: (f.criadoEm || "").slice(0, 7),
    grupoRotulo: f.criadoEm ? mesPorExtenso(f.criadoEm.slice(0, 7)) : "sem data",
    titulo: [f.postoGrad, f.nome].filter(Boolean).join(" ") || "—",
    detalhe: `feita em ${dataBR(f.criadoEm)}${f.horario ? ` às ${f.horario}` : ""}${f.criadoPor ? ` por ${f.criadoPor}` : ""}`,
  }));

  // Imprimir registra a ficha (com a cópia da folha) na lista das feitas.
  const imprimir = () => {
    if (sel) {
      fetch("/api/diarias/credores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: sel.id, nome, campos }),
      }).then(() => carregarFeitas()).catch(() => { /* a ficha já saiu; o registro não pode atrapalhar */ });
    }
    window.print();
  };

  // Abrir uma ficha feita: a folha volta como saiu; o "original" é o cadastro
  // de hoje, então o que estiver diferente aparece para salvar no cadastro.
  const abrirFeita = async (i: ItemFeito) => {
    setAbrindo(i.id); setMsg("");
    try {
      const r = await fetch(`/api/diarias/credores?id=${encodeURIComponent(i.id)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Não foi possível abrir a ficha."); return; }
      const rf = await fetch(`/api/efetivo/${encodeURIComponent(d.idPmma)}`);
      const f = rf.ok ? await rf.json() : {};
      const doCadastro: Campos = {
        matricula: f.matricula || "", cpf: f.cpf || "",
        endereco: f.endereco || "", bairro: f.bairro || "", cidade: f.cidade || "",
        telefone: f.telefone || "", banco: f.banco || "", agencia: f.agencia || "",
        conta: f.conta || "",
      };
      setSel({ id: d.idPmma, postoGrad: f.postoGrad, numeroBarra: f.numeroBarra, nome: f.nome, nomeGuerra: f.nomeGuerra, matricula: f.matricula } as Militar);
      setNome(d.nome || nomeCredor(f));
      setCampos({ ...VAZIO, ...(d.campos || {}) });
      setOriginal(doCadastro);
      setVersaoFolha((v) => v + 1);
      setTimeout(() => document.getElementById("folha-credor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch { setMsg("Não foi possível abrir a ficha."); }
    finally { setAbrindo(null); }
  };

  const apagarFeita = async (i: ItemFeito) => {
    if (!await confirmar(`Tirar da lista a ficha de ${i.titulo}?`, { rotuloOk: "Tirar", perigo: true })) return;
    const r = await fetch(`/api/diarias/credores?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setFeitas((l) => l.filter((x) => x.id !== i.id));
  };

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
            <button onClick={imprimir} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
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

      <ListaFeitos
        titulo="Fichas de credor feitas"
        itens={itensFeitos}
        carregando={carregandoFeitas}
        erro={erroFeitas}
        vazio="Nenhuma ficha feita ainda. Ela entra aqui quando você imprime."
        abertaDeInicio
        onAbrir={abrirFeita}
        onApagar={apagarFeita}
        onAtualizar={carregarFeitas}
        abrindo={abrindo}
      />

      {carregando && <p className="text-center text-sm text-[#94A3B8] print:hidden">Carregando a ficha...</p>}

      {/* ----- a folha ----- */}
      {sel && !carregando && (
        // key: ao trocar de militar a folha remonta, senão os campos
        // contentEditable guardariam o texto do militar anterior.
        <div id="folha-credor" key={`${sel.id}-${versaoFolha}`} className="folha-diaria mx-auto bg-white text-black shadow-2xl print:shadow-none" style={FOLHA_A4}>
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
