"use client";

import { useEffect, useState } from "react";
import { Printer, Pencil, Check } from "lucide-react";
import {
  BuscaMilitar, Campo, Cabecalho, BlocoAssinatura, SeletorAssinatura,
  ESTILO_FOLHA, FOLHA_A4, dataPorExtenso, type Militar, type ModoAss,
} from "@/components/docs/Comum";
import { classificarPatente } from "@/lib/patentes";

/* OFÍCIO DE APRESENTAÇÃO À JMS (aba Guia JMS e Ofício)

   Folha branca igual ao documento oficial. Diferente da Guia, o NÚMERO DO
   OFÍCIO nasce EM BRANCO e é preenchido à mão: a série de ofícios do Batalhão
   é alimentada por outros setores além do SIGEP — interna e externamente —,
   entao numerar automaticamente daqui criaria numero repetido com o que foi
   emitido fora do sistema. */

// "Cb PM nº 369/10" — como aparece no corpo do ofício.
function identificacao(m: { postoGrad?: string | null; numeroBarra?: string | null; quadro?: string | null }): string {
  const p = classificarPatente(m.postoGrad ?? "");
  const abrev = (m.postoGrad || "").trim();
  const ehOficial = p.ordem <= 7;
  const quadro = (m.quadro || "").trim().toUpperCase();
  const barra = (m.numeroBarra || "").trim();
  const base = ehOficial ? `${abrev} ${quadro || "PM"}` : `${abrev} PM`;
  return (ehOficial || !/\d/.test(barra) ? base : `${base} nº ${barra}`).replace(/\s+/g, " ").trim();
}

export default function OficioJms() {
  const [sel, setSel] = useState<Militar | null>(null);
  // Em branco de propósito — ver comentário no topo.
  const [numero, setNumero] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [dataDoc, setDataDoc] = useState(`Presidente Dutra- MA, ${dataPorExtenso()}.`);
  const [setor, setSetor] = useState("P/1-18º BPM");
  const [de, setDe] = useState("Ten. Cel QOPM Cmt. do 18º BPM.");
  const [para, setPara] = useState("Ten Cel QOSPM da JMS.");
  const [assunto, setAssunto] = useState("Apresentação de Praça PM.");
  const [corpo, setCorpo] = useState("");
  const [comandante, setComandante] = useState("TEN CEL QOEM FLÁVIO DE CARVALHO RAMOS");
  const [modoAss, setModoAss] = useState<ModoAss>("imagem");
  const [dataVisita, setDataVisita] = useState("");
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.comandante) setComandante(String(d.comandante)); }).catch(() => {});
  }, []);

  // Texto igual ao do ofício original, com a data da JMS por extenso. A
  // auxiliar ajusta na folha se o caso for outro.
  const montarCorpo = (ident: string, nome: string, id: string, dia: string) =>
    `Apresento a Vossa Senhoria o ${ident}- ${nome}, ID n° ${id}, do 18º BPM, ` +
    `para ser avaliado por Junta Médica de Saúde, no dia ${dia || "___________"}.`;

  // "2026-05-11" -> "11 de maio de 2026"
  const diaExtenso = (iso: string) =>
    iso && iso.length >= 10 ? dataPorExtenso(new Date(`${iso}T00:00:00`)) : "";

  const escolher = async (m: Militar) => {
    setCarregando(true); setEditando(false);
    try {
      const r = await fetch(`/api/efetivo/${encodeURIComponent(m.id)}`);
      const f = r.ok ? await r.json() : {};
      setSel(m);
      setCorpo(montarCorpo(identificacao({ ...m, ...f }), String(f.nome || m.nome || "").toUpperCase(), m.id || "", diaExtenso(dataVisita)));
    } finally { setCarregando(false); }
  };

  // Trocar a data da JMS reescreve o corpo, a menos que já tenha sido editado
  // à mão — nesse caso a auxiliar manda no texto.
  const trocarData = async (iso: string) => {
    setDataVisita(iso);
    if (!sel) return;
    const r = await fetch(`/api/efetivo/${encodeURIComponent(sel.id)}`);
    const f = r.ok ? await r.json() : {};
    setCorpo(montarCorpo(identificacao({ ...sel, ...f }), String(f.nome || sel.nome || "").toUpperCase(), sel.id || "", diaExtenso(iso)));
  };

  const limpar = () => { setSel(null); setCorpo(""); setNumero(""); setDataVisita(""); setEditando(false); };

  return (
    <>
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 print:hidden">
        <BuscaMilitar sel={sel} onEscolher={escolher} onLimpar={limpar} rotulo="Militar a apresentar" />

        {sel && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-[#94A3B8]">Nº do ofício</label>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="em branco"
                className="w-24 rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <span className="text-xs text-[#94A3B8]">/</span>
              <input value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-20 rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <label className="ml-2 text-xs text-[#94A3B8]">Data da JMS</label>
              <input type="date" value={dataVisita} onChange={(e) => trocarData(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
            <p className="mt-1 text-xs text-[#94A3B8]">
              O número do ofício fica em branco de propósito — a série é alimentada por outros setores além do SIGEP.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110">
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button onClick={() => setEditando((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition ${editando ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                {editando ? <><Check className="h-4 w-4" /> Pronto</> : <><Pencil className="h-4 w-4" /> Editar</>}
              </button>
            </div>

            <div className="mt-3">
              <SeletorAssinatura modo={modoAss} onChange={setModoAss} opcoes={["imagem", "sigep", "gov", "branco"]} />
            </div>

            {editando && (
              <p className="mt-2 text-xs text-amber-300">
                Modo edição: dá para mexer em qualquer parte do documento — rótulos, cabeçalho, o Do/Ao, o assunto e o corpo.
              </p>
            )}
          </>
        )}
        {!sel && <p className="mt-2 text-xs text-[#94A3B8]">Busque o militar e o ofício sai redigido com os dados dele. O número é preenchido à mão.</p>}
      </div>

      {carregando && <p className="text-center text-sm text-[#94A3B8] print:hidden">Carregando...</p>}

      {sel && !carregando && (
        <div
          key={sel.id}
          className="folha-diaria mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{ ...FOLHA_A4, outline: editando ? "2px solid #f59e0b" : "none" }}
          contentEditable={editando}
          suppressContentEditableWarning
        >
          <Cabecalho contato="TELEFONE: (99) 98509-5005 (Permanência) – 18batalhaopmma@gmail.com" />

          {/* Ordem do documento original: a cidade/data vem PRIMEIRO, e só
              abaixo o nº do ofício, com o setor na MESMA linha, à direita. */}
          <p style={{ textAlign: "right", margin: "12mm 0 0" }}>
            <Campo valor={dataDoc} onChange={setDataDoc} min="70mm" />
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "8mm 0 0" }}>
            <p style={{ margin: 0 }}>Ofício nº <Campo valor={numero} onChange={setNumero} min="18mm" centro />/{ano}</p>
            <p style={{ margin: 0 }}><Campo valor={setor} onChange={setSetor} min="30mm" /></p>
          </div>

          <p style={{ margin: "10mm 0 0" }}>Do: <Campo valor={de} onChange={setDe} min="80mm" /></p>
          <p style={{ margin: 0 }}>Ao: <Campo valor={para} onChange={setPara} min="80mm" /></p>

          <p style={{ margin: "8mm 0 10mm" }}>Assunto: <Campo valor={assunto} onChange={setAssunto} min="80mm" /></p>

          <p style={{ textAlign: "justify", textIndent: "14mm", margin: "0 0 14mm", lineHeight: 1.8 }}>
            <Campo valor={corpo} onChange={setCorpo} inline />
          </p>

          <p style={{ margin: "0 0 18mm" }}>Atenciosamente,</p>

          <BlocoAssinatura modo={modoAss} nome={comandante} cargo="CMT  DO 18º BPM" largura="52mm" />
        </div>
      )}

      <style>{ESTILO_FOLHA}</style>
    </>
  );
}
