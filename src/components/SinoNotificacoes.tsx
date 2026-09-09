"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ArrowLeftRight, Check, MessageSquare, FileSignature } from "lucide-react";
import { usePulso, useMudancaDeOutraAba, avisarMudanca } from "@/lib/sincronia";

type Notificacao = { id: string; texto: string; em: string; href?: string };
const CHAVE_VISTAS = "sigep_notif_vistas";

function lerVistas(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "[]")); }
  catch { return new Set(); }
}
function salvarVistas(s: Set<string>) {
  try { localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...s])); } catch { /* ignore */ }
}
/* Bolinha com o numero no icone do app (quando instalado no celular ou no
   computador). Onde o navegador nao tem, simplesmente nao acontece nada. */
function bolinhaNoIcone(n: number) {
  try {
    const nav = navigator as any;
    if (n > 0) nav?.setAppBadge?.(n)?.catch?.(() => {});
    else nav?.clearAppBadge?.()?.catch?.(() => {});
  } catch { /* navegador sem suporte */ }
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function SinoNotificacoes() {
  const router = useRouter();
  const [nots, setNots] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [naoVistas, setNaoVistas] = useState(0);
  const vistasRef = useRef<Set<string>>(new Set());

  function recalcular(lista: Notificacao[]) {
    const vistas = vistasRef.current;
    const n = lista.filter((x) => !vistas.has(x.id)).length;
    setNaoVistas(n);
    bolinhaNoIcone(n);
  }

  function aplicar(lista: Notificacao[]) {
    setNots(lista);
    // limpa das "vistas" ids que nao existem mais (permutas ja resolvidas),
    // para nao crescer sem limite
    const idsAtuais = new Set(lista.map((n) => n.id));
    const podadas = new Set([...vistasRef.current].filter((id) => idsAtuais.has(id)));
    vistasRef.current = podadas;
    salvarVistas(podadas);
    recalcular(lista);
  }

  useEffect(() => { vistasRef.current = lerVistas(); }, []);

  /* As notificações agora chegam pelo pulso do sistema (lib/sincronia), junto
     com o resto: uma requisição por minuto, feita por UMA aba só, no lugar das
     quatro que cada aba fazia por conta própria. E o sino passa a acender no
     mesmo instante em que a escala se atualiza, em vez de até um minuto depois. */
  usePulso((p) => { if (p.notificacoes) aplicar(p.notificacoes); });

  /* Outra aba leu o sino: as "vistas" ficam no localStorage, que é comum às
     abas, mas cada uma guarda a sua cópia em memória. Sem este aviso, o P/1
     lia as notificações numa aba e a outra continuava com a bolinha vermelha
     acesa até dar F5. */
  useMudancaDeOutraAba((o) => {
    if (o !== "notificacoes") return;
    vistasRef.current = lerVistas();
    recalcular(nots);
  });

  function abrir() {
    const novo = !aberto;
    setAberto(novo);
    if (novo) {
      // ao abrir, zera as notificacoes (marca todas as atuais como vistas)
      const vistas = new Set(vistasRef.current);
      nots.forEach((n) => vistas.add(n.id));
      vistasRef.current = vistas;
      salvarVistas(vistas);
      setNaoVistas(0);
      bolinhaNoIcone(0);
      avisarMudanca("notificacoes");   // apaga a bolinha nas outras abas também
    }
  }

  return (
    <div className="relative">
      <button
        onClick={abrir}
        className="relative rounded-lg p-2 text-apagado transition hover:bg-white/5 hover:text-white"
        aria-label={naoVistas > 0 ? `${naoVistas} notificação(ões)` : "Notificações"}
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {naoVistas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {naoVistas > 9 ? "9+" : naoVistas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-xl border border-white/10 bg-painel shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <p className="text-sm font-semibold text-white">Notificações</p>
              {nots.length > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-apagado">{nots.length}</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {nots.length === 0 ? (
                <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                  <Check className="h-6 w-6 text-emerald-400" />
                  <p className="text-sm text-apagado">Sem notificações no momento.</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {nots.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => { setAberto(false); router.push(n.href || "/permutas"); }}
                        className="flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-white/5"
                      >
                        {n.id.startsWith("chat:")
                          ? <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-ouro" />
                          : n.id.startsWith("memo")
                          ? <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-ouro" />
                          : <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-ouro" />}
                        <span className="min-w-0">
                          <span className="block text-sm text-white">{n.texto}</span>
                          <span className="block text-[11px] text-apagado">{quando(n.em)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => { setAberto(false); router.push("/permutas"); }}
              className="block w-full border-t border-white/10 px-4 py-2.5 text-center text-xs font-medium text-ouro hover:bg-white/5"
            >
              Ver permutas
            </button>
          </div>
        </>
      )}
    </div>
  );
}
