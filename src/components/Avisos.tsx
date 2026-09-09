"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, Info, X, HelpCircle } from "lucide-react";

/* =========================================================================
   AVISOS E CONFIRMAÇÕES COM A CARA DO SISTEMA

   O que havia antes: alert() e confirm() do navegador, em 98 lugares. Aquela
   caixa cinza do Chrome trava a página inteira, não tem nada a ver com o
   SIGEP, no celular fica horrível e, pior, some sem deixar rastro — quem
   estava lendo um erro comprido e clicou fora perdeu a mensagem.

   Aqui os avisos deslizam num canto, ficam o tempo suficiente para serem
   lidos, empilham quando são vários e podem ser fechados. A confirmação vira
   uma caixa no estilo do sistema, com o botão perigoso em vermelho — porque
   "apagar a escala do mês" e "salvar" não podem parecer a mesma coisa.

   COMO USAR (fora de componente React, igual ao alert() antigo):

       import { avisar, confirmar } from "@/components/Avisos";

       avisar("Escala salva.");                      // sucesso (padrão)
       avisar("Falha ao salvar.", "erro");
       avisar("Confira os conflitos.", "atencao");

       if (!(await confirmar("Apagar este dia?", { rotuloOk: "Apagar", perigo: true }))) return;

   `confirmar` devolve uma promessa, então a função que chama precisa ser
   async — é a única diferença em relação ao confirm() do navegador, e é o
   preço de não travar a página inteira enquanto a pergunta está no ar.
   ========================================================================= */

export type TipoAviso = "sucesso" | "erro" | "atencao" | "info";

type Aviso = { id: number; texto: string; tipo: TipoAviso };
type Pergunta = {
  id: number;
  texto: string;
  rotuloOk: string;
  perigo: boolean;
  responder: (r: boolean) => void;
};

/* Barramento simples: quem avisa não precisa estar dentro do React, e a
   Central escuta. É o que permite `avisar()` ser chamado de dentro de um
   .catch(), como o alert() era. */
let proximoId = 1;
const ouvintesAviso = new Set<(a: Aviso) => void>();
const ouvintesPergunta = new Set<(p: Pergunta) => void>();

/* De que tipo é este aviso, pelo próprio texto.

   Isto existe para a troca do alert() ser uma renomeação e nada mais: se
   fosse preciso classificar 64 chamadas à mão, cada uma seria uma chance de
   errar a sintaxe, e a revisão viraria impossível. Quem quiser manda o tipo
   explícito; quem não mandar recebe uma leitura razoável.

   Na dúvida devolve "info", NUNCA "sucesso": mensagem desconhecida pintada
   de verde faria uma falha parecer que deu certo. */
function tipoDoTexto(t: string): TipoAviso {
  const s = t.toLowerCase();
  if (/falha|erro|não foi possível|nao foi possivel|não consegui|nao consegui|inválid|invalid|negad|recusad|expirad|obrigatóri|obrigatori/.test(s)) return "erro";
  if (/✅|salv[oa]|gravad|conclu|aplicad|gerad|enviad|importad|removid|exclu[íi]d|assinad|com sucesso/.test(s)) return "sucesso";
  if (/atenção|atencao|confira|verifique|cuidado|conflito|pendênci|pendenci/.test(s)) return "atencao";
  return "info";
}

export function avisar(texto: string, tipo?: TipoAviso): void {
  const t = String(texto || "").trim();
  if (!t) return;
  const a: Aviso = { id: proximoId++, texto: t, tipo: tipo ?? tipoDoTexto(t) };
  if (ouvintesAviso.size === 0) {
    /* A Central ainda não montou (ou a página não a tem). Não dá para perder
       um aviso de erro em silêncio — cai no alert() de sempre, que é feio mas
       aparece. */
    if (typeof window !== "undefined") window.alert(t);
    return;
  }
  for (const f of ouvintesAviso) f(a);
}

export function confirmar(
  texto: string,
  opcoes: { rotuloOk?: string; perigo?: boolean } = {},
): Promise<boolean> {
  const t = String(texto || "").trim();
  if (ouvintesPergunta.size === 0) {
    // Mesma rede de segurança: sem a Central, usa o confirm() do navegador.
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(t) : false);
  }
  return new Promise<boolean>((resolve) => {
    const p: Pergunta = {
      id: proximoId++,
      texto: t,
      rotuloOk: opcoes.rotuloOk || "Confirmar",
      perigo: opcoes.perigo === true,
      responder: resolve,
    };
    for (const f of ouvintesPergunta) f(p);
  });
}

/* ---------------------------- a Central ---------------------------- */

const CORES: Record<TipoAviso, { barra: string; icone: string; Icone: any }> = {
  sucesso: { barra: "#10b981", icone: "text-emerald-300", Icone: CheckCircle2 },
  erro: { barra: "#ef4444", icone: "text-red-300", Icone: AlertTriangle },
  atencao: { barra: "#f0b24b", icone: "text-amber-300", Icone: AlertTriangle },
  info: { barra: "#38bdf8", icone: "text-sky-300", Icone: Info },
};

/* Erro fica mais tempo: quase sempre traz um texto do servidor que a pessoa
   precisa ler inteiro (às vezes para repassar). Sucesso é só confirmação. */
const DURACAO: Record<TipoAviso, number> = { sucesso: 3200, info: 4000, atencao: 5200, erro: 7000 };

export default function CentralAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const fechar = useCallback((id: number) => {
    setAvisos((l) => l.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    const aoAviso = (a: Aviso) => {
      setAvisos((l) => [...l.slice(-3), a]);   // no máximo 4 na tela
      setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== a.id)), DURACAO[a.tipo]);
    };
    const aoPerguntar = (p: Pergunta) => setPerguntas((l) => [...l, p]);
    ouvintesAviso.add(aoAviso);
    ouvintesPergunta.add(aoPerguntar);
    return () => { ouvintesAviso.delete(aoAviso); ouvintesPergunta.delete(aoPerguntar); };
  }, []);

  const responder = (p: Pergunta, r: boolean) => {
    p.responder(r);
    setPerguntas((l) => l.filter((x) => x.id !== p.id));
  };

  // Esc responde "não" à pergunta de cima — o mesmo que o confirm() fazia.
  const daVez = perguntas[perguntas.length - 1];
  useEffect(() => {
    if (!daVez) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") responder(daVez, false);
      if (e.key === "Enter") responder(daVez, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daVez]);

  if (!montado) return null;

  return createPortal(
    <>
      {/* ---- avisos empilhados no canto ---- */}
      <div
        className="nao-imprimir pointer-events-none fixed bottom-4 right-4 z-[9998] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
      >
        {avisos.map((a) => {
          const c = CORES[a.tipo];
          return (
            <div
              key={a.id}
              role="status"
              className="aviso-entra pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/10 bg-painel px-3.5 py-3 shadow-2xl"
              style={{ borderLeft: `3px solid ${c.barra}` }}
            >
              <c.Icone className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${c.icone}`} />
              <span className="min-w-0 flex-1 whitespace-pre-line text-[13.5px] leading-snug text-white">{a.texto}</span>
              <button
                onClick={() => fechar(a.id)}
                aria-label="Fechar aviso"
                className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-apagado transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ---- confirmação ---- */}
      {daVez && (
        <div className="nao-imprimir fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/65" onClick={() => responder(daVez, false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            className="dialogo-entra relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-painel shadow-2xl"
          >
            <div className="flex items-start gap-3 px-5 pb-4 pt-5">
              <HelpCircle className={`mt-0.5 h-5 w-5 shrink-0 ${daVez.perigo ? "text-red-300" : "text-ouro"}`} />
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-white">{daVez.texto}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button
                onClick={() => responder(daVez, false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apagado transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </button>
              <button
                autoFocus
                onClick={() => responder(daVez, true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 ${
                  daVez.perigo ? "bg-red-500 text-white" : "bg-ouro text-ouro-texto"
                }`}
              >
                {daVez.rotuloOk}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
