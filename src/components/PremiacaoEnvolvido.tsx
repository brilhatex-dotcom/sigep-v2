import Link from "next/link";
import { Award, PenLine, CheckCircle2, Landmark } from "lucide-react";
import {
  TIPO_ASSINATURA, listarPecunia, podeVer, refAssinatura, faltaBanco,
} from "@/lib/requerimentoPecunia";
import { refsAssinadas } from "@/lib/assinaturaSigep";

/* =========================================================================
   OS REQUERIMENTOS DE PREMIAÇÃO QUE ENVOLVEM ESTE POLICIAL

   O requerimento por apreensão de arma de fogo é COLETIVO e quase sempre é
   outra pessoa que monta — o P/1, ou o primeiro da equipe que chegou no
   sistema. Quem foi incluído precisa saber disso em algum lugar que ele já
   abre, e não só no sino, que ele pode ter deixado passar.

   Fica aqui, no alto de /requerimentos, e só aparece quando há algo:
   requerimento nenhum, bloco nenhum.

   Não usa o quadro de AVISOS de propósito. Aquele quadro é um mural: uma
   linha lá vai para o Batalhão inteiro. "Fulano entrou no requerimento de
   premiação RP-2026-000004" é assunto de quem está no documento — anunciar
   isso para todo mundo entregaria quem participou de que apreensão, e quem
   está pedindo dinheiro por ela.
   ========================================================================= */

export default async function PremiacaoEnvolvido({
  meuId, login, admin,
}: {
  meuId: string;
  login: string;
  admin: boolean;
}) {
  let itens: { id: string; criadoPorNome: string; quantidade: number; souDele: boolean; jaAssinei: boolean; semBanco: boolean }[] = [];
  try {
    const todos = (await listarPecunia(60)).filter((r) => podeVer(r, login, meuId || null, admin));
    if (!todos.length) return null;
    const assinei = meuId
      ? await refsAssinadas(TIPO_ASSINATURA, todos.map((r) => refAssinatura(r.id, meuId)))
      : new Set<string>();
    itens = todos.map((r) => {
      const minha = meuId ? r.dados.linhas.find((l) => l.efetivoId === meuId) : undefined;
      return {
        id: r.id,
        criadoPorNome: r.criadoPorNome,
        quantidade: r.dados.linhas.length,
        souDele: !!minha,
        // marcar o Gov.br também resolve a pendência: o espaço sai em branco
        jaAssinei: !!minha && (assinei.has(refAssinatura(r.id, meuId)) || !!minha.assinarGov),
        semBanco: !!minha && faltaBanco(minha),
      };
    });
  } catch {
    return null; // tabela ainda não criada, ou banco fora: a tela não quebra
  }
  if (!itens.length) return null;

  const pendentes = itens.filter((i) => i.souDele && !i.jaAssinei).length;

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-[#0F1B2D] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Award className="h-4 w-4 text-[#D4AF37]" />
        <h2 className="text-sm font-semibold text-white">Premiação pecuniária</h2>
        {pendentes > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
            {pendentes === 1 ? "1 esperando por você" : `${pendentes} esperando por você`}
          </span>
        )}
        <Link href="/requerimentos/premiacao" className="ml-auto text-xs text-[#94A3B8] transition hover:text-white">
          novo requerimento →
        </Link>
      </div>

      <div className="space-y-1">
        {itens.map((i) => (
          <Link
            key={i.id}
            href={`/requerimentos/premiacao?id=${encodeURIComponent(i.id)}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-[#0b1626] px-3 py-2 transition hover:border-[#D4AF37]/30"
          >
            <span className="text-sm font-semibold text-white">{i.id}</span>
            <span className="text-xs text-[#6f82a0]">
              {i.criadoPorNome ? `montado por ${i.criadoPorNome}` : "—"} · {i.quantidade} policial(is)
            </span>
            {i.souDele && (
              i.jaAssinei ? (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> resolvido
                </span>
              ) : i.semBanco ? (
                /* Primeiro a conta, depois a assinatura: a conta faz parte do
                   que é assinado, então mandar assinar antes só faria o
                   requerimento ter de ser reaberto depois. */
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                  <Landmark className="h-3 w-3" /> falta seus dados bancários
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                  <PenLine className="h-3 w-3" /> falta você assinar
                </span>
              )
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
