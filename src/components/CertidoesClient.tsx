"use client";

import { useMemo, useState } from "react";
import { Award, ArrowLeft, Search, Loader2, FileDown, AlertTriangle, Check, X } from "lucide-react";
import { avisar } from "@/components/Avisos";
import {
  ANOS_MEDALHA, REQUISITOS_MEDALHA, UPM, marca, paragrafosCertidaoMedalha,
  type AnosMedalha, type DadosCertidaoMedalha,
} from "@/lib/certidaoMedalha";

/* =========================================================================
   CERTIDÕES (P/1): a lista de modelos; clicou num, abre o formulário.
   O policial é escolhido pelo nome; o resto vem da ficha (e do Histórico
   Policial, o BG de inclusão) e pode ser conferido antes de baixar o Word.
   A prévia ao lado é o mesmo texto que sai no arquivo.
   ========================================================================= */

type Militar = { id: string; postoGrad: string; nome: string; nomeGuerra: string; matricula: string };

// os modelos disponíveis — os próximos entram aqui
const MODELOS = [
  {
    id: "medalha",
    titulo: "Certidão para Medalha do Serviço Policial Militar",
    descricao: "10, 20 ou 30 anos. Inclusão, BG e requisitos do regulamento (ANEXO I), com o VISTO do Cmt.",
    Icone: Award,
  },
] as const;

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hojeISO = () => {
  const d = new Date(Date.now() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
};

export default function CertidoesClient({ efetivo }: { efetivo: Militar[] }) {
  const [modelo, setModelo] = useState<string | null>(null);

  if (modelo === "medalha") {
    return (
      <div className="mx-auto max-w-6xl">
        <button onClick={() => setModelo(null)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#D4AF37] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Todos os modelos
        </button>
        <CertidaoMedalha efetivo={efetivo} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold text-white">Certidões</h1>
      <p className="mb-5 text-sm text-[#94A3B8]">
        Escolha o modelo. O sistema preenche com os dados da ficha do policial; o senhor confere e baixa em Word.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODELOS.map((m) => (
          <button key={m.id} onClick={() => setModelo(m.id)}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0F1B2D] p-4 text-left transition hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/[.06]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
              <m.Icone className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{m.titulo}</span>
              <span className="mt-0.5 block text-xs text-[#94A3B8]">{m.descricao}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ medalha */

type Sugestao = {
  militar: string; matricula: string; idPmma: string; dataInclusao: string; bgInclusao: string;
  anosServico: number | null; tempoPelaBarra: boolean; anos: AnosMedalha; temDireito: boolean;
  chefe: string; chefeFuncao: string;
};

const campo = "w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50";

function CertidaoMedalha({ efetivo }: { efetivo: Militar[] }) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Militar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [info, setInfo] = useState<Pick<Sugestao, "anosServico" | "tempoPelaBarra" | "temDireito"> | null>(null);
  const [d, setD] = useState<DadosCertidaoMedalha>({
    anos: 10, militar: "", matricula: "", idPmma: "", dataInclusao: "", bgInclusao: "",
    requisitos: REQUISITOS_MEDALHA.map(() => true), chefe: "", chefeFuncao: "",
    cidade: "Presidente Dutra", data: hojeISO(),
  });
  const muda = <K extends keyof DadosCertidaoMedalha>(k: K, v: DadosCertidaoMedalha[K]) => setD((x) => ({ ...x, [k]: v }));

  const achados = useMemo(() => {
    const t = normal(busca.trim());
    if (t.length < 2) return [];
    return efetivo.filter((m) => normal(`${m.nome} ${m.nomeGuerra} ${m.matricula} ${m.id}`).includes(t)).slice(0, 8);
  }, [busca, efetivo]);

  async function escolher(m: Militar) {
    setEscolhido(m);
    setBusca("");
    setCarregando(true);
    try {
      const r = await fetch(`/api/certidoes/medalha?efetivoId=${encodeURIComponent(m.id)}`, { cache: "no-store" });
      const s: Sugestao & { error?: string } = await r.json();
      if (!r.ok) { avisar(s.error || "Falha ao carregar a ficha.", "erro"); return; }
      setInfo({ anosServico: s.anosServico, tempoPelaBarra: s.tempoPelaBarra, temDireito: s.temDireito });
      setD((x) => ({
        ...x, anos: s.anos, militar: s.militar, matricula: s.matricula, idPmma: s.idPmma,
        dataInclusao: s.dataInclusao, bgInclusao: s.bgInclusao, chefe: s.chefe, chefeFuncao: s.chefeFuncao,
        requisitos: REQUISITOS_MEDALHA.map(() => true),
      }));
    } finally {
      setCarregando(false);
    }
  }

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch("/api/certidoes/medalha", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); avisar(j.error || "Falha ao gerar a certidão.", "erro"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certidao Medalha ${d.anos} anos - ${d.militar}.docx`.replace(/[\\/:*?"<>|]+/g, " ");
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      avisar("Erro de conexão ao gerar.", "erro");
    } finally {
      setGerando(false);
    }
  }

  const faltam = [
    !d.dataInclusao.trim() && "a data de inclusão",
    !d.bgInclusao.trim() && "o BG da inclusão",
  ].filter(Boolean) as string[];

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-white">Certidão para Medalha do Serviço Policial Militar</h1>
      <p className="mb-4 text-sm text-[#94A3B8]">Escolha o policial: o resto vem da ficha. Confira e baixe em Word.</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------- formulário ---------- */}
        <section className="ui-card space-y-3 p-4">
          <div className="relative">
            <label className="mb-1 block text-xs font-semibold text-[#cbd5e1]">Policial</label>
            {escolhido ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{escolhido.postoGrad} {escolhido.nome}</span>
                {carregando && <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />}
                <button onClick={() => { setEscolhido(null); setInfo(null); muda("militar", ""); }} aria-label="Trocar o policial"
                  className="rounded p-1 text-[#94A3B8] hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-[#94A3B8]" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus
                  placeholder="Digite o nome, nome de guerra ou matrícula…" className={`${campo} pl-9`} />
                {achados.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0F1B2D] shadow-xl">
                    {achados.map((m) => (
                      <button key={m.id} onClick={() => escolher(m)} className="block w-full px-3 py-2 text-left hover:bg-white/5">
                        <span className="block text-sm text-white">{m.postoGrad} {m.nomeGuerra || m.nome}</span>
                        <span className="block text-[11px] text-[#94A3B8]">{m.nome} · mat. {m.matricula || "—"} · ID {m.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {escolhido && !carregando && (
            <>
              {info && (
                <p className={`rounded-lg border p-2.5 text-xs ${info.temDireito ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`}>
                  {info.anosServico === null
                    ? "Sem data de inclusão nem barra na ficha: não deu para calcular o tempo de serviço."
                    : `${info.anosServico} anos de serviço${info.tempoPelaBarra ? " (pelo ano da barra — confira a inclusão)" : ""}. `}
                  {info.anosServico !== null && (info.temDireito ? `Já alcança a medalha de ${d.anos} anos.` : "Ainda não completou 10 anos.")}
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#cbd5e1]">Medalha</label>
                <div className="flex gap-2">
                  {ANOS_MEDALHA.map((a) => (
                    <button key={a} onClick={() => muda("anos", a)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${d.anos === a ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]" : "border-white/10 text-[#cbd5e1] hover:border-white/30"}`}>
                      {a} anos
                    </button>
                  ))}
                </div>
              </div>

              <Rotulo t="Identificação (como sai na certidão)">
                <input value={d.militar} onChange={(e) => muda("militar", e.target.value)} className={campo} />
              </Rotulo>
              <div className="grid grid-cols-2 gap-2">
                <Rotulo t="Matrícula"><input value={d.matricula} onChange={(e) => muda("matricula", e.target.value)} className={campo} /></Rotulo>
                <Rotulo t="ID"><input value={d.idPmma} onChange={(e) => muda("idPmma", e.target.value)} className={campo} /></Rotulo>
                <Rotulo t="Data de inclusão"><input value={d.dataInclusao} onChange={(e) => muda("dataInclusao", e.target.value)} placeholder="dd/mm/aaaa" className={campo} /></Rotulo>
                <Rotulo t="BG da inclusão (nº e data)"><input value={d.bgInclusao} onChange={(e) => muda("bgInclusao", e.target.value)} placeholder="143 de 03/08/1992" className={campo} /></Rotulo>
              </div>
              {faltam.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Falta {faltam.join(" e ")} — preencha aqui, ou sai uma lacuna para completar à mão.
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#cbd5e1]">Requisitos (desmarque o que ele NÃO atende)</label>
                <div className="space-y-1">
                  {REQUISITOS_MEDALHA.map((r, i) => (
                    <button key={i} onClick={() => muda("requisitos", d.requisitos.map((v, k) => (k === i ? !v : v)))}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#cbd5e1] hover:bg-white/5">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${d.requisitos[i] ? "border-[#D4AF37] bg-[#D4AF37] text-[#1a1205]" : "border-white/30"}`}>
                        {d.requisitos[i] && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span>{r}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Rotulo t="Cidade"><input value={d.cidade} onChange={(e) => muda("cidade", e.target.value)} className={campo} /></Rotulo>
                <Rotulo t="Data da certidão"><input type="date" value={d.data} onChange={(e) => muda("data", e.target.value)} className={`${campo} [color-scheme:dark]`} /></Rotulo>
              </div>
              <Rotulo t="Quem assina (Chefe do P/1)"><input value={d.chefe} onChange={(e) => muda("chefe", e.target.value)} className={campo} /></Rotulo>
              <Rotulo t="Função"><input value={d.chefeFuncao} onChange={(e) => muda("chefeFuncao", e.target.value)} className={campo} /></Rotulo>

              <button onClick={gerar} disabled={gerando || !d.militar.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1a1205] transition hover:brightness-110 disabled:opacity-50">
                {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Baixar a certidão (Word)
              </button>
            </>
          )}
        </section>

        {/* ---------- prévia ---------- */}
        <section className="overflow-hidden rounded-xl bg-white p-6 text-[13px] leading-relaxed text-black shadow-xl sm:p-8" style={{ fontFamily: "'Times New Roman', serif" }}>
          {!escolhido ? (
            <p className="py-20 text-center text-sm text-slate-500">Escolha o policial para ver a certidão.</p>
          ) : (
            <Previa d={d} />
          )}
        </section>
      </div>
    </div>
  );
}

function Rotulo({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[#cbd5e1]">{t}</label>
      {children}
    </div>
  );
}

function Previa({ d }: { d: DadosCertidaoMedalha }) {
  return (
    <div>
      <div className="text-center text-[12px] leading-tight">
        <p>ESTADO DO MARANHÃO</p>
        <p>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
        <p>POLÍCIA MILITAR DO MARANHÃO</p>
        <p>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
        <p className="font-bold">18º BATALHÃO DE POLÍCIA MILITAR</p>
        <p className="border-b border-black pb-1 text-[10px]">Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000</p>
        <p className="mt-1">ANEXO I</p>
      </div>
      <div className="mt-3 w-56">
        <p className="tracking-[0.3em]">VISTO</p>
        <p>Em ____/____/________</p>
        <p className="mt-6 border-t border-black pt-0.5">Comandante do {UPM}</p>
      </div>
      <p className="my-5 text-center font-bold tracking-[0.4em] underline">CERTIDÃO</p>
      {paragrafosCertidaoMedalha(d).map((p, i) =>
        p.tipo === "item" ? (
          <p key={i} className="mb-1 text-justify">
            <b className={p.marcado ? "" : "font-normal"}>{marca(p.marcado)}</b> {p.texto}
          </p>
        ) : (
          <p key={i} className="mb-2 text-justify indent-12">
            {p.trechos.map((t, k) => (t.b ? <b key={k}>{t.t}</b> : <span key={k}>{t.t}</span>))}
          </p>
        ),
      )}
      <div className="mt-10 text-center">
        <p>______________________________________</p>
        <p className="font-bold">{(d.chefe || "").toUpperCase()}</p>
        <p className="font-bold">{d.chefeFuncao}</p>
      </div>
    </div>
  );
}
