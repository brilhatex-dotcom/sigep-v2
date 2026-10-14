"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown, ArrowRight, Bell, Check, ChevronDown, ChevronUp, Copy, FileText, KeyRound, Landmark,
  MessageCircle, PenLine, Printer, ShieldCheck, UserCheck, Users, HelpCircle,
} from "lucide-react";
import { avisar } from "@/components/Avisos";

/* =========================================================================
   COMO ASSINAR O REQUERIMENTO DE PREMIAÇÃO — o passo a passo NA TELA.

   A dúvida que motivou isto: "cadê o Assinar no SIGEP dos outros policiais?".
   O botão só aparece na linha de quem está logado, e é assim de propósito —
   assinatura é pessoal, vale a senha de quem assina, e ninguém (nem quem
   montou, nem o P/1) assina pelo colega. Mas a tela não dizia isso, e quem
   montou o documento ficava procurando um botão que não ia aparecer.

   Então a tela passa a ENSINAR o caminho:
     · quatro passos numerados, com a cor dizendo onde o documento está
       (verde = feito, dourado = é agora, cinza = depois);
     · o caminho de cada forma de assinar desenhado em "telinhas" com setas
       — o colega reconhece depois a mesma tela no celular dele;
     · um recado pronto para mandar no WhatsApp a quem falta assinar.
   ========================================================================= */

type Estado = "feito" | "agora" | "depois";

const COR: Record<Estado, { anel: string; num: string; titulo: string }> = {
  feito: { anel: "border-emerald-400/40 bg-emerald-500/10", num: "bg-emerald-500 text-[#04210f]", titulo: "text-emerald-200" },
  agora: { anel: "border-[#D4AF37]/70 bg-[#D4AF37]/10 ring-2 ring-[#D4AF37]/30", num: "bg-[#D4AF37] text-[#1a1205]", titulo: "text-[#f3df9d]" },
  depois: { anel: "border-white/10 bg-white/[0.02]", num: "bg-white/10 text-[#94A3B8]", titulo: "text-[#cbd5e1]" },
};

export type Pendente = { nome: string; temLogin: boolean; semConta: boolean; sou: boolean };

export default function GuiaAssinaturaPecunia({
  reqId, totalPoliciais, comConta, totalLinhas, assinadosSigep, marcadosGov, pendentes, avulsos,
}: {
  reqId: string;
  totalPoliciais: number;     // policiais do efetivo no requerimento
  comConta: number;           // quantos já têm a conta preenchida (de todas as linhas)
  totalLinhas: number;        // todas as linhas, inclusive as digitadas à mão
  assinadosSigep: number;
  marcadosGov: number;
  pendentes: Pendente[];      // do efetivo, ainda sem assinatura e sem Gov.br marcado
  avulsos: number;            // linhas digitadas à mão (de fora do efetivo)
}) {
  const [aberto, setAberto] = useState(true);
  const [aba, setAba] = useState<"sigep" | "gov" | "caneta">("sigep");

  // quem já leu o guia pode deixá-lo fechado (só neste navegador)
  useEffect(() => {
    try { if (localStorage.getItem("guia-pecunia-fechado") === "1") setAberto(false); } catch { /* sem storage */ }
  }, []);
  const alternar = () => {
    setAberto((v) => {
      try { localStorage.setItem("guia-pecunia-fechado", v ? "1" : "0"); } catch { /* sem storage */ }
      return !v;
    });
  };

  const resolvidos = assinadosSigep + marcadosGov;
  const passo1: Estado = reqId ? "feito" : "agora";
  const contaOk = totalLinhas > 0 && comConta >= totalLinhas;
  const passo2: Estado = !reqId ? "depois" : contaOk ? "feito" : "agora";
  const assOk = totalPoliciais > 0 && resolvidos >= totalPoliciais;
  const passo3: Estado = !reqId || !contaOk ? "depois" : assOk ? "feito" : "agora";
  const passo4: Estado = assOk ? "agora" : "depois";

  /* Recado pronto para o WhatsApp de quem ainda falta. O link leva direto
     ao requerimento — o SIGEP pede o login antes, e é o login DELE. */
  const recado = () => {
    const link = typeof window !== "undefined"
      ? `${window.location.origin}/requerimentos/premiacao?id=${encodeURIComponent(reqId)}` : "";
    // o recado é para os COLEGAS: quem está mandando não entra na lista
    const nomes = pendentes.filter((p) => p.temLogin && !p.sou).map((p) => p.nome).filter(Boolean);
    return [
      `*Requerimento de premiação pecuniária ${reqId}* (apreensão de arma de fogo)`,
      nomes.length ? `Falta a assinatura de: ${nomes.join(", ")}.` : "",
      "",
      "Como assinar (leva 1 minuto):",
      "1) Entre no SIGEP com o *SEU* login",
      `2) Abra o requerimento: ${link}`,
      "   (ou toque no sino 🔔 → \"Você entrou num requerimento de premiação\")",
      "3) Confira seus dados bancários — se faltar, toque em *Preencher meus dados bancários* (o botão de assinar só libera quando a conta de todos estiver preenchida)",
      "4) Toque em *Assinar no SIGEP* e digite a *SUA* senha",
      "",
      "Prefere assinar pelo Gov.br? Me avise que eu marco.",
    ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(recado()); avisar("Recado copiado — cole no WhatsApp do grupo ou do colega.", "sucesso"); }
    catch { avisar("Não consegui copiar. Use o botão do WhatsApp.", "atencao"); }
  };
  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(recado())}`, "_blank", "noopener");
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#D4AF37]/25 bg-[#0b1626]">
      <button onClick={alternar} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <HelpCircle className="h-5 w-5 shrink-0 text-[#D4AF37]" />
        <span className="flex-1">
          <span className="block text-sm font-bold text-white">Como assinar este requerimento — passo a passo</span>
          <span className="block text-[11px] text-[#94A3B8]">
            {reqId
              ? `${resolvidos} de ${totalPoliciais} policial(is) resolvido(s) · ${comConta} de ${totalLinhas} com conta preenchida`
              : "Comece acrescentando os policiais e guardando o requerimento."}
          </span>
        </span>
        <span className="text-[11px] text-[#94A3B8]">{aberto ? "esconder" : "mostrar"}</span>
        {aberto ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-white/10 px-4 py-4">
          {/* ---------------- os 4 passos ---------------- */}
          <div className="flex flex-col items-stretch gap-2 lg:flex-row">
            <Passo n={1} estado={passo1} icone={<Users className="h-4 w-4" />} titulo="Montar e guardar" quem="Quem monta o requerimento (ou o P/1)">
              Acrescente <b>todos</b> os policiais da apreensão e clique em <b>Guardar</b>. O documento ganha um número
              {reqId ? <> (<b>{reqId}</b>)</> : " (RP-…)"} e cada policial recebe o aviso no <b>sino 🔔</b> e no celular.
            </Passo>
            <Seta />
            <Passo n={2} estado={passo2} icone={<Landmark className="h-4 w-4" />} titulo="Dados bancários" quem="Cada policial — ou quem montou / P/1">
              Cada um confere a <b>própria conta</b> em <i>Preencher / Corrigir</i> (ou na Ficha Individual). O{" "}
              <b>Assinar no SIGEP</b> só libera 🔒 quando a conta de <b>todos</b> estiver preenchida: ela faz parte do que é assinado.
              {reqId && <Contagem ok={contaOk} texto={`${comConta} de ${totalLinhas} com conta`} />}
            </Passo>
            <Seta />
            <Passo n={3} estado={passo3} icone={<PenLine className="h-4 w-4" />} titulo="Cada um assina a SUA linha" quem="Cada policial, no PRÓPRIO login">
              No SIGEP (senha), pelo Gov.br ou à caneta. O botão <b>Assinar no SIGEP</b> só aparece na linha de quem
              está logado — veja abaixo como o colega faz.
              {reqId && <Contagem ok={assOk} texto={`${assinadosSigep} no SIGEP · ${marcadosGov} pelo Gov.br · ${pendentes.length} faltando`} />}
            </Passo>
            <Seta />
            <Passo n={4} estado={passo4} icone={<Printer className="h-4 w-4" />} titulo="Salvar o PDF e entregar" quem="Quem montou o requerimento">
              Com todos resolvidos, clique em <b>Imprimir / Salvar PDF</b>. Quem marcou Gov.br assina esse PDF; quem vai
              de caneta, assina no papel.
            </Passo>
          </div>

          {/* ---------------- por que o botão não aparece para os outros ---------------- */}
          <div className="flex gap-3 rounded-lg border border-sky-400/25 bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-100">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
            <div>
              <b className="text-white">Por que o &quot;Assinar no SIGEP&quot; só aparece na sua linha?</b> Porque assinatura é
              <b> pessoal</b>: vale a senha de quem assina. Nem quem montou o requerimento, nem o P/1 assina pelo colega —
              seria assinatura falsa. Cada policial entra no SIGEP com o <b>login dele</b>, abre este mesmo requerimento e
              assina a própria linha. Você pode <b>marcar Gov.br</b> por um colega (só deixa o espaço em branco), mas não assinar por ele.
            </div>
          </div>

          {/* ---------------- o caminho desenhado ---------------- */}
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {([
                ["sigep", "No SIGEP (recomendado)", <ShieldCheck key="i" className="h-3.5 w-3.5" />],
                ["gov", "Pelo Gov.br", <FileText key="i" className="h-3.5 w-3.5" />],
                ["caneta", "À caneta", <PenLine key="i" className="h-3.5 w-3.5" />],
              ] as const).map(([k, rotulo, ic]) => (
                <button key={k} onClick={() => setAba(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    aba === k ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/10 text-[#cbd5e1] hover:border-[#D4AF37]/40"}`}>
                  {ic} {rotulo}
                </button>
              ))}
            </div>

            {aba === "sigep" && (
              <Trilha>
                <Tela n={1} legenda={<>Entra no SIGEP com o <b>próprio</b> login e toca no sino</>}>
                  <div className="flex items-center gap-2">
                    <span className="relative">
                      <Bell className="h-5 w-5 text-white" />
                      <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">1</span>
                    </span>
                    <span className="text-[10px] leading-tight text-[#cbd5e1]">Você entrou num requerimento de premiação</span>
                  </div>
                </Tela>
                <Tela n={2} legenda={<>Abre o requerimento <b>{reqId || "RP-…"}</b></>}>
                  <div className="text-[10px] font-semibold text-white">{reqId || "RP-2026-0000…"}</div>
                  <span className="mt-1 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">falta a sua assinatura</span>
                </Tela>
                <Tela n={3} legenda={<>Confere a conta — se faltar, <b>Preencher</b></>}>
                  <div className="font-mono text-[9px] text-[#94A3B8]">AG 0000-0 CC 00.000-0</div>
                  <span className="mt-1 inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[9px] text-[#cbd5e1]">
                    <Landmark className="h-2.5 w-2.5" /> Corrigir
                  </span>
                </Tela>
                <Tela n={4} legenda={<>Toca em <b>Assinar no SIGEP</b> (na linha dele)</>} destaque>
                  <span className="inline-flex animate-pulse items-center gap-1 rounded-md border border-[#D4AF37] px-2 py-1 text-[10px] font-semibold text-[#f3df9d]">
                    <ShieldCheck className="h-3 w-3" /> Assinar no SIGEP
                  </span>
                </Tela>
                <Tela n={5} legenda={<>Digita a <b>senha dele</b> do SIGEP</>}>
                  <div className="flex items-center gap-1 rounded border border-white/15 bg-[#0a1626] px-1.5 py-1">
                    <KeyRound className="h-3 w-3 text-[#94A3B8]" /><span className="text-[11px] tracking-widest text-white">••••••</span>
                  </div>
                </Tela>
                <Tela n={6} legenda={<>Pronto: carimbo com <b>QR</b> no documento</>} fim>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    <Check className="h-3 w-3" /> SIGEP · assinado
                  </span>
                </Tela>
              </Trilha>
            )}

            {aba === "gov" && (
              <>
                <Trilha>
                  <Tela n={1} legenda={<>Na linha dele, clica em <b>Assinar pelo Gov.br</b> (quem montou também pode marcar)</>}>
                    <span className="rounded-md border border-white/20 px-2 py-1 text-[10px] text-white">Assinar pelo Gov.br</span>
                  </Tela>
                  <Tela n={2} legenda={<>O espaço da assinatura sai <b>em branco</b> no PDF</>}>
                    <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[9px] text-sky-300">vai assinar pelo Gov.br</span>
                  </Tela>
                  <Tela n={3} legenda={<>Quem montou clica em <b>Imprimir / Salvar PDF</b> e manda o arquivo</>}>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#D4AF37] px-2 py-1 text-[10px] font-semibold text-[#1a1205]">
                      <Printer className="h-3 w-3" /> Salvar PDF
                    </span>
                  </Tela>
                  <Tela n={4} legenda={<>Cada um assina o PDF em <b>assinador.iti.br</b> (conta gov.br prata ou ouro)</>} fim>
                    <span className="text-[10px] font-semibold text-white">assinador.iti.br</span>
                  </Tela>
                </Trilha>
                <p className="mt-2 text-[11px] leading-relaxed text-[#94A3B8]">
                  Se forem dois ou mais pelo Gov.br, o PDF <b>passa de um para o outro</b>: cada um assina o arquivo que o
                  anterior já assinou, e o último devolve a quem montou. Abra{" "}
                  <a href="https://assinador.iti.br" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">assinador.iti.br</a>.
                </p>
              </>
            )}

            {aba === "caneta" && (
              <Trilha>
                <Tela n={1} legenda={<>Não marca nada: a linha fica <b>sem assinatura</b></>}>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-[#94A3B8]">sem assinatura</span>
                </Tela>
                <Tela n={2} legenda={<>Quem montou <b>imprime</b> o requerimento</>}>
                  <Printer className="h-5 w-5 text-white" />
                </Tela>
                <Tela n={3} legenda={<>Cada um assina <b>à mão</b> no espaço dele</>} fim>
                  <PenLine className="h-5 w-5 text-white" />
                </Tela>
              </Trilha>
            )}
          </div>

          {/* ---------------- quem falta, e o recado pronto ---------------- */}
          {reqId && pendentes.length > 0 && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-200">Ainda falta resolver a assinatura de:</p>
              <ul className="mb-3 space-y-1">
                {pendentes.map((p) => (
                  <li key={p.nome} className="flex flex-wrap items-center gap-1.5 text-xs text-[#e7d9b0]">
                    <ArrowRight className="h-3 w-3 text-amber-300" />
                    <b className="text-white">{p.nome}</b>
                    {p.sou ? (
                      <span className="text-[#f3df9d]">
                        — <b>é você</b>: {p.semConta ? "preencha seus dados bancários e depois " : ""}clique em <b>Assinar no SIGEP</b> na sua linha, aqui embaixo.
                      </span>
                    ) : p.temLogin ? (
                      <span className="text-[#cbd5e1]">
                        — assina no SIGEP pelo login dele{p.semConta ? ", depois de preencher a conta" : ""}. Já recebeu o aviso no sino.
                      </span>
                    ) : (
                      <span className="text-red-200">
                        — <b>não tem login ativo no SIGEP</b>: marque <b>Assinar pelo Gov.br</b> na linha dele, ou ele assina à caneta.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {pendentes.some((p) => !p.sou) && <div className="flex flex-wrap gap-2">
                <button onClick={whatsapp}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">
                  <MessageCircle className="h-3.5 w-3.5" /> Mandar o passo a passo no WhatsApp
                </button>
                <button onClick={copiar}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#cbd5e1] transition hover:border-[#D4AF37]/40 hover:text-white">
                  <Copy className="h-3.5 w-3.5" /> Copiar recado
                </button>
              </div>}
            </div>
          )}

          {avulsos > 0 && (
            <p className="text-[11px] text-[#94A3B8]">
              {avulsos} policial(is) digitado(s) à mão (de fora do efetivo — ex.: policial civil) não tem login no SIGEP:
              assina(m) pelo Gov.br no PDF ou à caneta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ peças */

function Passo({ n, estado, icone, titulo, quem, children }: {
  n: number; estado: Estado; icone: React.ReactNode; titulo: string; quem: string; children: React.ReactNode;
}) {
  const c = COR[estado];
  return (
    <div className={`flex-1 rounded-lg border p-3 ${c.anel}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.num}`}>
          {estado === "feito" ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <span className={`flex items-center gap-1.5 text-sm font-bold ${c.titulo}`}>{icone} {titulo}</span>
        {estado === "agora" && (
          <span className="ml-auto rounded-full bg-[#D4AF37] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#1a1205]">agora</span>
        )}
      </div>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#6f82a0]">{quem}</p>
      <div className="text-xs leading-relaxed text-[#cbd5e1]">{children}</div>
    </div>
  );
}

function Seta() {
  return (
    <div className="flex items-center justify-center text-[#D4AF37]/70">
      <ArrowDown className="h-4 w-4 lg:hidden" />
      <ArrowRight className="hidden h-4 w-4 lg:block" />
    </div>
  );
}

function Contagem({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`mt-1.5 block w-fit rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
      {ok ? "✓ " : ""}{texto}
    </span>
  );
}

function Trilha({ children }: { children: React.ReactNode }) {
  const itens = Array.isArray(children) ? children : [children];
  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
      {itens.map((c, i) => (
        <div key={i} className="contents">
          {c}
          {i < itens.length - 1 && (
            <div className="flex justify-center text-[#D4AF37]">
              <ArrowDown className="h-4 w-4 sm:hidden" />
              <ArrowRight className="hidden h-4 w-4 sm:block" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Tela({ n, legenda, children, destaque, fim }: {
  n: number; legenda: React.ReactNode; children: React.ReactNode; destaque?: boolean; fim?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-[132px]">
      {/* a "telinha": o que o colega vai ver no celular dele */}
      <div className={`flex h-[64px] flex-col items-center justify-center rounded-lg border px-2 text-center ${
        destaque ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
          : fim ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/15 bg-[#0F1B2D]"}`}>
        {children}
      </div>
      <p className="text-[10.5px] leading-snug text-[#cbd5e1]">
        <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#D4AF37] text-[9px] font-bold text-[#1a1205]">{n}</span>
        {legenda}
      </p>
    </div>
  );
}
