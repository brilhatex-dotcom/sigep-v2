import Link from "next/link";
import { PenLine } from "lucide-react";

/* =========================================================================
   UMA LINHA: quantos requerimentos de premiação esperam por VOCÊ.

   O bloco que existia antes listava todos os requerimentos no alto da tela —
   com quarenta viraria uma parede. Aqui é só a contagem, e por isso o tamanho
   não muda: dois ou duzentos ocupam a mesma linha.

   Só aparece quando falta alguma coisa. Nada pendente, nada na tela — quem
   está em dia não precisa ser lembrado de que está em dia.
   ========================================================================= */

export default function PremiacaoEsperando({ quantos, href }: { quantos: number; href: string }) {
  if (quantos < 1) return null;
  return (
    <Link
      href={href}
      className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200 transition hover:border-amber-400/50"
    >
      <PenLine className="h-4 w-4 shrink-0" />
      <span>
        {quantos === 1
          ? <><b>1 requerimento de premiação</b> espera por você.</>
          : <><b>{quantos} requerimentos de premiação</b> esperam por você.</>}
      </span>
      <span className="ml-auto shrink-0 text-xs text-amber-300/70">abrir →</span>
    </Link>
  );
}
