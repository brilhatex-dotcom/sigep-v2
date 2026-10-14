"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check, FileSignature, Landmark, Lock, PenLine, X } from "lucide-react";

/* =========================================================================
   AVISO AO ENTRAR — "você foi incluído num requerimento, falta você".

   O sino já avisava, mas o sino só ajuda quem olha para ele. Um requerimento
   coletivo de premiação fica PARADO até o último policial informar a conta e
   assinar — e o dinheiro de todos espera junto. Então, logo depois do login,
   o sistema mostra uma janela clara, com o que falta e um botão que leva
   direto ao requerimento certo.

   Quando aparece: UMA vez por login. O login grava um marcador
   (localStorage "sigep-entrada", em app/login/page.tsx); o aviso guarda qual
   marcador já mostrou. Assim:
     · "Lembrar depois" some com ele até o PRÓXIMO login — sem perseguir o
       policial a cada página ou a cada aba nova;
     · no próximo login, se ainda faltar, ele volta;
     · quando o policial assina (ou marca Gov.br), a pendência some da fonte
       e o aviso para de aparecer — a fonte é a mesma do sino.
   ========================================================================= */

type Item = {
  id: string; criadoPorNome: string; criadoEm: string; montouVoce: boolean;
  semConta: boolean; faltamOutros: number; quantidade: number; href: string;
};

const MARCA = "sigep-entrada";
const VISTO = "sigep-aviso-entrada-visto";

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

export default function AvisoAoEntrar() {
  const [itens, setItens] = useState<Item[]>([]);
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // já está na tela do requerimento: o aviso seria redundante
    if (pathname?.startsWith("/requerimentos/premiacao")) return;
    const marca = ler(MARCA) || "sem-marca";
    if (ler(VISTO) === marca) return;

    let vivo = true;
    // um respiro: a página que o policial abriu carrega primeiro
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/requerimentos/premiacao/pendentes", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        const xs: Item[] = Array.isArray(d?.itens) ? d.itens : [];
        if (!vivo) return;
        if (xs.length) { setItens(xs); setAberto(true); }
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

  if (!aberto || !itens.length) return null;

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
          <FileSignature className="mt-0.5 h-7 w-7 shrink-0" />
          <div className="flex-1">
            <h2 id="aviso-entrar-titulo" className="text-lg font-extrabold leading-tight">
              {itens.length === 1 ? "Falta você neste requerimento" : `${itens.length} requerimentos esperando por você`}
            </h2>
            <p className="text-xs font-semibold opacity-80">Premiação pecuniária por apreensão de arma de fogo</p>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="rounded-full p-1 hover:bg-black/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {itens.map((it) => (
            <div key={it.id} className="rounded-xl border border-white/10 bg-[#0b1626] p-4">
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

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-[#6f82a0]">
              Enquanto faltar a sua assinatura, este aviso volta no próximo login. Também fica no sino 🔔.
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
