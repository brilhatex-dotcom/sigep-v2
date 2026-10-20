"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, BellRing, Check, FileSignature, Landmark, Lock, Palmtree, PartyPopper, PenLine, Repeat, Trophy, X } from "lucide-react";
import BoasVindas from "@/components/BoasVindas";

/* =========================================================================
   AVISO AO ENTRAR — o que está esperando por você.

   O sino já avisava, mas o sino só ajuda quem olha para ele. Um requerimento
   coletivo de premiação fica PARADO até o último policial informar a conta e
   assinar; uma permuta fica parada até o colega dar o "concordo"; e assim
   por diante. Então, logo depois do login, o sistema mostra uma janela clara
   com o que falta e um botão que leva direto à página certa.

   O que entra (lib/notificacoes.ts → pendenciasAoEntrar): só o que exige
   AÇÃO — requerimento de premiação, permutas (concordo, ciência, parecer,
   visto), certidões para o P/1 conferir, memorandos esperando a seção.
   Chat e avisos informativos ficam só no sino.

   Quando aparece: UMA vez por login. O login grava um marcador
   (localStorage "sigep-entrada", em app/login/page.tsx); o aviso guarda qual
   marcador já mostrou. Assim:
     · "Lembrar depois" some com ele até o PRÓXIMO login — sem perseguir o
       policial a cada página ou a cada aba nova;
     · no próximo login, se ainda faltar, ele volta;
     · resolvida a pendência, ela some da fonte e o aviso para de aparecer —
       a fonte é a mesma do sino.
   ========================================================================= */

type Item = {
  id: string; criadoPorNome: string; criadoEm: string; montouVoce: boolean;
  semConta: boolean; faltamOutros: number; quantidade: number; href: string;
};
type Cartao = {
  id: string; assunto: "permuta" | "promocao" | "ferias"; titulo: string;
  linhas: string[]; mais: number; botao: string; href: string;
};

type Limite = { gradDestino: string; ciclo: string; ord: number | null; quadro: string };

const ICONE: Record<Cartao["assunto"], typeof Repeat> = { permuta: Repeat, promocao: Award, ferias: Palmtree };

const MARCA = "sigep-entrada";
const VISTO = "sigep-aviso-entrada-visto";

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

export default function AvisoAoEntrar({ nome = "" }: { nome?: string }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [outras, setOutras] = useState<Cartao[]>([]);
  const [limite, setLimite] = useState<Limite | null>(null);
  const [aberto, setAberto] = useState(false);
  /* Primeiro acesso: a apresentação de boas-vindas vem ANTES dos avisos —
     duas janelas ao mesmo tempo seria demais. Fechou a apresentação, abre o
     aviso (se houver o que avisar). */
  const [boasVindas, setBoasVindas] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const marca = ler(MARCA) || "sem-marca";
    if (ler(VISTO) === marca) return;

    let vivo = true;
    // um respiro: a página que o policial abriu carrega primeiro
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/pendencias", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        const xs: Item[] = Array.isArray(d?.pecunia) ? d.pecunia : [];
        const ys: Cartao[] = Array.isArray(d?.outras) ? d.outras : [];
        const lq: Limite | null = d?.limite && typeof d.limite === "object" ? d.limite : null;
        if (!vivo) return;
        setItens(xs); setOutras(ys); setLimite(lq);
        if (d?.boasVindas === true) { setBoasVindas(true); return; }
        if (xs.length || ys.length || lq) setAberto(true);
        // nada pendente: não pergunta de novo a cada página até o próximo login
        else gravar(VISTO, marca);
      } catch { /* sem rede: fica o sino */ }
    }, 900);
    return () => { vivo = false; clearTimeout(t); };
    // só na primeira página depois de entrar — não a cada navegação
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fechar = () => { gravar(VISTO, ler(MARCA) || "sem-marca"); setAberto(false); };
  const ir = (href: string) => { fechar(); router.push(href); };

  useEffect(() => {
    if (!aberto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // fechou (ou terminou) a apresentação: marca como vista e segue para os avisos
  const fecharBoasVindas = () => {
    setBoasVindas(false);
    fetch("/api/pendencias", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boasVindasVista: true }),
    }).catch(() => {});
    if (itens.length || outras.length || limite) setAberto(true);
    else gravar(VISTO, ler(MARCA) || "sem-marca");
  };
  if (boasVindas) return <BoasVindas nome={nome} aoFechar={fecharBoasVindas} />;

  const total = itens.length + outras.length + (limite ? 1 : 0);
  if (!aberto || !total) return null;
  // só requerimento de premiação: o título fala dele; misturado, fala de "pendências"
  const soPecunia = outras.length === 0 && !limite;
  const soLimite = !!limite && itens.length === 0 && outras.length === 0;

  /* Direto no <body>: montado dentro do cabeçalho (que é uma camada própria,
     z-30), a janela ficaria por baixo do balão do chat e do menu do celular. */
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="aviso-entrar-titulo"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#D4AF37]/50 bg-[#0F1B2D] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* faixa dourada: é para chamar a atenção, sem parecer erro */}
        <div className="flex items-start gap-3 rounded-t-2xl bg-gradient-to-r from-[#D4AF37] to-[#b8932a] px-5 py-4 text-[#1a1205]">
          {soLimite ? <PartyPopper className="mt-0.5 h-7 w-7 shrink-0" />
            : soPecunia ? <FileSignature className="mt-0.5 h-7 w-7 shrink-0" /> : <BellRing className="mt-0.5 h-7 w-7 shrink-0" />}
          <div className="flex-1">
            <h2 id="aviso-entrar-titulo" className="text-lg font-extrabold leading-tight">
              {soLimite ? "Parabéns!"
                : soPecunia
                ? (itens.length === 1 ? "Falta você neste requerimento" : `${itens.length} requerimentos esperando por você`)
                : (total === 1 ? "Tem 1 coisa esperando por você" : `Tem ${total} coisas esperando por você`)}
            </h2>
            <p className="text-xs font-semibold opacity-80">
              {soLimite ? "Você está no Limite Quantitativo da promoção"
                : soPecunia ? "Premiação pecuniária por apreensão de arma de fogo" : "Resolva agora ou depois — cada botão leva à página certa"}
            </p>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="rounded-full p-1 hover:bg-black/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {/* Parabéns: está no Limite Quantitativo da CPPPM */}
          {limite && (
            <div className="rounded-xl border border-[#D4AF37]/60 bg-gradient-to-br from-[#D4AF37]/20 to-transparent p-4 text-center">
              <Trophy className="mx-auto mb-2 h-10 w-10 text-[#D4AF37]" />
              <p className="text-lg font-extrabold text-white">Parabéns{nome ? `, ${nome}` : ""}!</p>
              <p className="mt-1 text-sm leading-relaxed text-[#e7d9b0]">
                Você está no <b className="text-white">Limite Quantitativo</b> para a promoção a{" "}
                <b className="text-white">{limite.gradDestino || "próxima graduação"}</b>
                {limite.ciclo ? <> de <b className="text-white">{limite.ciclo}</b></> : null}
                {limite.ord ? <> — <span className="whitespace-nowrap">ORD <b className="text-white">{limite.ord}</b></span></> : null}.
              </p>
              <p className="mt-2 text-sm text-[#cbd5e1]">Boa sorte! O próximo passo é enviar as suas certidões ao P/1.</p>
              <button onClick={() => ir("/promocoes/minhas-certidoes")}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-base font-extrabold text-[#1a1205] shadow-lg transition hover:brightness-110">
                Ir para as minhas certidões <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}
          {itens.map((it) => (
            <div key={it.id} className="rounded-xl border border-white/10 bg-[#0b1626] p-4">
              {/* misturado com outras pendências, o cartão diz de que se trata */}
              {!soPecunia && (
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
                    <FileSignature className="h-4 w-4" />
                  </span>
                  Requerimento de premiação pecuniária
                </p>
              )}
              <p className="text-sm leading-relaxed text-[#cbd5e1]">
                {it.montouVoce ? (
                  <>Você montou o requerimento <b className="whitespace-nowrap text-white">nº {it.id}</b> e ainda falta a <b className="text-white">sua</b> parte.</>
                ) : (
                  <><b className="text-white">{it.criadoPorNome || "O P/1"}</b> adicionou você ao requerimento{" "}
                    <b className="whitespace-nowrap text-white">nº {it.id}</b>{it.quantidade > 1 ? `, junto com mais ${it.quantidade - 1} policial(is)` : ""}.</>
                )}
              </p>

              {/* o que ELE tem de fazer, na ordem */}
              <ol className="mt-3 space-y-2">
                <li className="flex items-start gap-2 text-sm">
                  {it.semConta ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-[#1a1205]">1</span>
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[#04210f]"><Check className="h-4 w-4" /></span>
                  )}
                  <span className={it.semConta ? "text-amber-100" : "text-[#cbd5e1]"}>
                    <Landmark className="mr-1 inline h-4 w-4 align-[-3px]" />
                    {it.semConta
                      ? <><b>Informe seus dados bancários</b> — é a conta em que a premiação vai cair.</>
                      : <>Sua conta já está lá — <b>só confira</b> banco, agência e conta.</>}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-xs font-bold text-[#1a1205]">2</span>
                  <span className="text-[#cbd5e1]">
                    <PenLine className="mr-1 inline h-4 w-4 align-[-3px]" />
                    <b>Assine</b> com a sua senha do SIGEP (botão <b>Assinar no SIGEP</b> na sua linha) — ou escolha Gov.br.
                    {it.faltamOutros > 0 && (
                      <span className="mt-1 flex items-start gap-1 text-xs text-[#94A3B8]">
                        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                        O botão de assinar libera quando a conta de {it.faltamOutros === 1 ? "mais 1 colega" : `mais ${it.faltamOutros} colegas`} também entrar.
                        {it.semConta ? "" : " Abra mesmo assim para conferir a sua."}
                      </span>
                    )}
                  </span>
                </li>
              </ol>

              <button onClick={() => ir(it.href)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-extrabold sm:text-base text-[#1a1205] shadow-lg transition hover:brightness-110">
                {it.semConta ? "Confirmar meus dados e assinar" : "Abrir e assinar"} <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          ))}

          {outras.map((c) => {
            const Icone = ICONE[c.assunto] || BellRing;
            return (
              <div key={c.id} className="rounded-xl border border-white/10 bg-[#0b1626] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-white">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
                    <Icone className="h-4 w-4" />
                  </span>
                  {c.titulo}
                </p>
                <ul className="mt-2 space-y-1 pl-9">
                  {c.linhas.map((l, i) => (
                    <li key={i} className="list-disc text-xs leading-snug text-[#cbd5e1]">{l}</li>
                  ))}
                  {c.mais > 0 && <li className="list-none text-xs text-[#94A3B8]">… e mais {c.mais}.</li>}
                </ul>
                <button onClick={() => ir(c.href)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/60 bg-[#D4AF37]/10 px-4 py-2.5 text-sm font-bold text-[#f3df9d] transition hover:bg-[#D4AF37]/20">
                  {c.botao} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-[#6f82a0]">
              Enquanto houver pendência, este aviso volta no próximo login. Tudo também fica no sino 🔔.
            </p>
            <button onClick={fechar} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#cbd5e1] hover:bg-white/5">
              Lembrar depois
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
