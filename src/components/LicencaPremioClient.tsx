"use client";

import { useRouter } from "next/navigation";
import LicencaPremio, { EquipeLicencaView } from "@/components/LicencaPremio";

export default function LicencaPremioClient(props: {
  anos: string[];
  anoSelecionado: string;
  equipes: EquipeLicencaView[];
  totalMilitares: number;
  totalOficiais: number;
  totalPracas: number;
  idsJaAlocados: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <LicencaPremio
      {...props}
      onTrocarAno={(ano) => router.push(`/licenca-premio?ano=${encodeURIComponent(ano)}`)}
      onAtualizar={() => router.refresh()}
    />
  );
}
