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
  postergadosIniciais?: { idPmma: string; nome: string; motivo: string; data: string }[];
}) {
  const router = useRouter();
  return (
    <PlanoFerias
      {...props}
      onTrocarAno={(ano) => router.push(`/ferias?ano=${encodeURIComponent(ano)}`)}
    />
  );
}
