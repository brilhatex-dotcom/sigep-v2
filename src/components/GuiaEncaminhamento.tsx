"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, Loader2, BookmarkCheck } from "lucide-react";
import {
  BuscaMilitar, Campo, Cabecalho, BlocoAssinatura, SeletorAssinatura, BotoesDocumento,
  ESTILO_FOLHA, FOLHA_A4, brData, type Militar, type ModoAss,
} from "@/components/docs/Comum";
import { classificarPatente } from "@/lib/patentes";

/* GUIA DE ENCAMINHAMENTO MÉDICO (aba Guia JMS e Ofício)

   Folha branca igual ao documento oficial: moldura em volta de tudo, cabecalho
   com o emblema da PM a esquerda e o brasao do Estado ao centro, o quadro de
   identificacao com a informacao do Cmt e, embaixo, o quadro do PARECER MÉDICO
   que o medico preenche a mao.

   O NUMERO e automatico e sequencial por ano. A tela mostra o proximo numero
   livre como previa; ele so e consumido quando a guia e REGISTRADA, para nao
   queimar numeracao com documento que nao chegou a sair. Depois de registrado,
   o numero fica gravado e a reimpressao sai sempre igual. */

// "Cb. PM nº 369/10" — como aparece na linha "Graduação:" do documento.
function graduacao(m: { postoGrad?: string | null; numeroBarra?: string | null; quadro?: string | null }): string {
  const p = classificarPatente(m.postoGrad ?? "");
  const abrev = (m.postoGrad || "").trim();
  const ehOficial = p.ordem <= 7;
  const quadro = (m.quadro || "").trim().toUpperCase();
  const barra = (m.numeroBarra || "").trim();
  // Oficial leva o quadro e nao tem numeracao; praca leva "PM" e o nº da barra.
  const base = ehOficial ? `${abrev} ${quadro || "PM"}` : `${abrev} PM`;
  return (ehOficial || !/\d/.test(barra) ? base : `${base} nº ${barra}`).replace(/\s+/g, " ").trim();
}

export default function GuiaEncaminhamento() {
  const anoAtual = String(new Date().getFullYear());
  const [sel, setSel] = useState<Militar | null>(null);
  const [numero, setNumero] = useState("");
  const [registrada, setRegistrada] = useState(false);
  const [ano, setAno] = useState(anoAtual);
  const [nome, setNome] = useState("");
  const [grad, setGrad] = useState("");
  const [matricula, setMatricula] = useState("");
  const [idPm, setIdPm] = useState("");
  const [dataVisita, setDataVisita] = useState("");
  const [informacao, setInformacao] = useState(
    "O citado policial militar encontra-se com problemas de saúde, necessitando homologar atestado médico, em anexo."
  );
  const [cidadeParecer, setCidadeParecer] = useState("São Luis - MA, ___ / ___/ ___");
  const [comandante, setComandante] = useState("TEN CEL QOPM FLÁVIO DE CARVALHO RAMOS");
  const [modoAss, setModoAss] = useState<ModoAss>("imagem");
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/escala-chefe").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.comandante) setComandante(String(d.comandante)); }).catch(() => {});
  }, []);

  /* Ponto de partida do ano: qual foi a ÚLTIMA guia emitida NO PAPEL, antes do
     sistema. O Batalhão já estava na 028/2026 quando o SIGEP entrou, e a série
     do ano não recomeça por causa disso — informando 28 aqui, a próxima sai
     029. Fica guardado por ano. */
  const [ultimaPapel, setUltimaPapel] = useState<number>(0);
  const [editandoSerie, setEditandoSerie] = useState(false);
  const [rascunhoSerie, setRascunhoSerie] = useState("");
  const [salvandoSerie, setSalvandoSerie] = useState(false);

  // Prévia do próximo número livre do ano.
  const buscarProximo = async (anoAlvo: string) => {
    const r = await fetch(`/api/jms/guias?ano=${encodeURIComponent(anoAlvo)}`);
    const d = r.ok ? await r.json() : {};
    if (typeof d?.proximo === "number") setNumero(String(d.proximo).padStart(3, "0"));
    if (typeof d?.ultimaForaDoSistema === "number") setUltimaPapel(d.ultimaForaDoSistema);
  };
  useEffect(() => { buscarProximo(ano); /* eslint-disable-next-line */ }, [ano]);

  const salvarSerie = async () => {
    const n = Number(rascunhoSerie.replace(/\D/g, ""));
    if (!Number.isFinite(n)) { setMsg("Informe um número."); return; }
    setSalvandoSerie(true); setMsg("");
    try {
      const r = await fetch("/api/jms/guias", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, ultimaForaDoSistema: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Falha ao salvar a numeração."); return; }
      setUltimaPapel(d.ultimaForaDoSistema);
      setNumero(String(d.proximo).padStart(3, "0"));
      setEditandoSerie(false);
      setMsg(`✅ Numeração ajustada: a próxima guia sai ${String(d.proximo).padStart(3, "0")}/${ano}.`);
    } catch { setMsg("Falha ao salvar a numeração."); }
    finally { setSalvandoSerie(false); }
  };

  const escolher = async (m: Militar) => {
    setMsg(""); setCarregando(true); setEditando(false); setRegistrada(false);
    try {
      const r = await fetch(`/api/efetivo/${encodeURIComponent(m.id)}`);
      const f = r.ok ? await r.json() : {};
      setSel(m);
      setNome(String(f.nome || m.nome || "").toUpperCase());
      setGrad(graduacao({ ...m, ...f }));
      setMatricula(f.matricula || "");
      setIdPm(m.id || "");
      await buscarProximo(ano);
    } catch { setMsg("Falha ao carregar a ficha do militar."); }
    finally { setCarregando(false); }
  };

  const limpar = () => {
    setSel(null); setNome(""); setGrad(""); setMatricula(""); setIdPm("");
    setDataVisita(""); setRegistrada(false); setMsg(""); setEditando(false);
  };

  // Consome o número: a partir daqui ele é da guia e não volta para a fila.
  const registrar = async () => {
    if (!sel || registrada) return;
    setRegistrando(true); setMsg("");
    try {
      const r = await fetch("/api/jms/guias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPmma: sel.id, ano, nome, dataVisita }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || "Falha ao registrar a guia."); return; }
      setNumero(String(d.guia.numero).padStart(3, "0"));
      setRegistrada(true);
      setMsg(`✅ Guia nº ${String(d.guia.numero).padStart(3, "0")}/${ano} registrada.`);
    } catch { setMsg("Falha ao registrar a guia."); }
    finally { setRegistrando(false); }
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 print:hidden">
        <BuscaMilitar sel={sel} onEscolher={escolher} onLimpar={limpar} rotulo="Militar a encaminhar" />

        {sel && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-[#94A3B8]">Data da visita médica</label>
              <input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <label className="ml-2 text-xs text-[#94A3B8]">Ano</label>
              <input value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-20 rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <span className={`text-xs ${registrada ? "text-emerald-300" : "text-[#94A3B8]"}`}>
                {registrada ? `nº ${numero}/${ano} — registrada` : `próximo número livre: ${numero}/${ano}`}
              </span>
            </div>

            {/* De onde a numeração do ano continua */}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
              {editandoSerie ? (
                <>
                  <span>Última guia emitida no papel em {ano}:</span>
                  <input autoFocus value={rascunhoSerie}
                    onChange={(e) => setRascunhoSerie(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="028"
                    className="w-20 rounded-lg border border-[#D4AF37]/50 bg-[#0b1626] px-2 py-1 text-sm text-white outline-none" />
                  <button onClick={salvarSerie} disabled={salvandoSerie}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-xs font-semibold text-[#1a1205] disabled:opacity-50">
                    {salvandoSerie ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salvar
                  </button>
                  <button onClick={() => setEditandoSerie(false)} className="text-[#94A3B8] hover:text-white">cancelar</button>
                  <span className="w-full text-[11px] text-[#7e8b99]">
                    Informe o número da última guia que saiu no papel. A próxima do sistema sai logo depois dela.
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {ultimaPapel > 0
                      ? `Numeração continua de ${String(ultimaPapel).padStart(3, "0")}/${ano} (última emitida no papel).`
                      : `Numeração começando do zero em ${ano}.`}
                  </span>
                  <button
                    onClick={() => { setRascunhoSerie(String(ultimaPapel || "")); setEditandoSerie(true); }}
                    className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-[#94A3B8] transition hover:border-[#D4AF37]/40 hover:text-white">
                    <Pencil className="h-3 w-3" /> ajustar
                  </button>
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BotoesDocumento
                tipo="guia"
                nomeArquivo={`guia-jms-${(numero || "sn").replace(/\W+/g, "") || "sn"}-${ano}`}
                dados={() => ({
                  numero, ano, dataVisita: brData(dataVisita),
                  nome, grad, matricula, idPm, informacao, cidadeParecer,
                  comandante, cargo: "CMT DO 18º BPM", modoAss,
                })}
              />
              <button onClick={registrar} disabled={registrando || registrada}
                title={registrada ? "Esta guia já consumiu o número" : "Consome o número e guarda a guia no registro do ano"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/5 disabled:opacity-40">
                {registrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkCheck className="h-4 w-4" />}
                {registrada ? "Guia registrada" : "Registrar guia (consome o número)"}
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
                Modo edição: dá para mexer em qualquer parte do documento — rótulos, títulos, cabeçalho e o texto da informação.
              </p>
            )}
            {msg && <p className="mt-2 text-xs text-[#94A3B8]">{msg}</p>}
          </>
        )}
        {!sel && <p className="mt-2 text-xs text-[#94A3B8]">Busque o militar. O número da guia é automático e sequencial por ano — só é consumido quando a guia é registrada.</p>}
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
          {/* moldura em volta de tudo, como no documento original */}
          <div style={{ border: "0.8pt solid #000", padding: "5mm 6mm" }}>
            <Cabecalho contato="TELEFONE: (99) 98509-5005 (Permanência) – 18batalhaopmma@gmail.com" />

            <p style={{ textAlign: "center", fontWeight: "bold", margin: "8mm 0 5mm" }}>
              Guia de Encaminhamento Médico nº <Campo valor={numero} onChange={setNumero} min="16mm" centro />/{ano}.
            </p>

            {/* ---- quadro da identificação + informação do Cmt ---- */}
            <div style={{ border: "0.8pt solid #000", padding: "4mm 5mm" }}>
              {/* A data vem do seletor da barra de comando; no modo Editar a
                  folha inteira fica editável e ela também pode ser ajustada. */}
              <p style={{ textAlign: "center", margin: "0 0 5mm" }}>
                Visita Médica do dia&nbsp;&nbsp;&nbsp;{brData(dataVisita) || "___/___/_____"}.
              </p>

              <p style={{ margin: "0 0 1mm" }}>Nome: <Campo valor={nome} onChange={setNome} min="110mm" /></p>
              <p style={{ margin: "0 0 1mm" }}>
                Graduação: <Campo valor={grad} onChange={setGrad} min="45mm" />
                <span style={{ display: "inline-block", width: "12mm" }} />
                Matrícula: <Campo valor={matricula} onChange={setMatricula} min="30mm" />
              </p>
              <p style={{ margin: "0 0 5mm" }}>ID: <Campo valor={idPm} onChange={setIdPm} min="30mm" /></p>

              <p style={{ textAlign: "center", margin: "0 0 4mm" }}>Informação do Cmt</p>

              <p style={{ textAlign: "justify", textIndent: "12mm", margin: "0 0 22mm" }}>
                <Campo valor={informacao} onChange={setInformacao} inline />
              </p>

              <BlocoAssinatura modo={modoAss} nome={comandante} cargo="CMT  DO 18º BPM" largura="52mm" />
            </div>

            {/* ---- quadro do parecer médico (preenchido à mão) ---- */}
            <div style={{ border: "0.8pt solid #000", padding: "4mm 5mm", marginTop: "5mm", minHeight: "52mm" }}>
              <p style={{ textAlign: "center", margin: "0 0 22mm" }}>PARECER MÉDICO</p>
              <p style={{ textAlign: "center", margin: "0 0 16mm" }}>
                <Campo valor={cidadeParecer} onChange={setCidadeParecer} min="70mm" centro />
              </p>
              <p style={{ textAlign: "center", margin: 0 }}>_________________________________________</p>
              <p style={{ textAlign: "center", margin: 0 }}>MÉDICO</p>
            </div>
          </div>
        </div>
      )}

      <style>{ESTILO_FOLHA}</style>
    </>
  );
}
