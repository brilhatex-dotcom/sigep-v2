"use client";

import { useState } from "react";
import { FileText, Plane } from "lucide-react";
import FichaCredor from "@/components/FichaCredor";
import FichaControleIndividual from "@/components/FichaControleIndividual";

/* Área de DIÁRIAS: as duas fichas na mesma tela, escolhidas por aba. Cada uma
   tem o seu próprio buscador de militar, porque nem sempre é o mesmo militar
   nas duas. */
type Aba = "credor" | "controle";

export default function DiariasClient() {
  const [aba, setAba] = useState<Aba>("credor");

  const Botao = ({ id, rotulo, Icone }: { id: Aba; rotulo: string; Icone: typeof FileText }) => (
    <button
      onClick={() => setAba(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        aba === id ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/10 text-[#94A3B8] hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icone className="h-4 w-4" /> {rotulo}
    </button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Botao id="credor" rotulo="Cadastro de Credor" Icone={FileText} />
        <Botao id="controle" rotulo="Controle Individual" Icone={Plane} />
      </div>

      {/* Só a ficha da aba ativa fica montada — assim a impressão nunca leva a outra junto. */}
      {aba === "credor" ? <FichaCredor /> : <FichaControleIndividual />}
    </>
  );
}
