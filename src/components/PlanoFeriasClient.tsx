"use client";

import { useRouter } from "next/navigation";
import PlanoFerias, { EquipeView } from "@/components/PlanoFerias";

export default function PlanoFeriasClient(props: {
  anos: string[];
  anoSelecionado: string;
  equipes: EquipeView[];
  totalMilitares: number;
  totalOficiais: number;
  totalPracas: number;
  isAdmin: boolean;
  numerosMemorando: Record<string, number>;
  postergadosIniciais?: { idPmma: string; nome: string; motivo: string; data: string; exercicio?: string }[];
  reequilibrioEm?: string | null;
}) {
  const router = useRouter();
  return (
    <PlanoFerias
      {...props}
      onTrocarAno={(ano) => router.push(`/ferias?ano=${encodeURIComponent(ano)}`)}
    />
  );
}
