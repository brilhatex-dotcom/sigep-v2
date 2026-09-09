"use client";

import { useState } from "react";
import { FileText, Stethoscope, History } from "lucide-react";
import OficioJms from "@/components/OficioJms";
import GuiaEncaminhamento from "@/components/GuiaEncaminhamento";
import HistoricoJms from "@/components/HistoricoJms";

/* Aba GUIA JMS E OFÍCIO: os dois documentos na mesma tela, escolhidos por aba.
   Normalmente saem juntos (o ofício apresenta o militar à Junta e a guia vai
   com ele), mas cada um tem o seu próprio buscador porque nem sempre é o mesmo
   militar nos dois.

   A terceira aba é o histórico: o que já foi emitido, por mês. */
type Aba = "oficio" | "guia" | "emitidos";

export default function GuiaJmsClient() {
  const [aba, setAba] = useState<Aba>("oficio");

  const Botao = ({ id, rotulo, Icone }: { id: Aba; rotulo: string; Icone: typeof FileText }) => (
    <button
      onClick={() => setAba(id)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        aba === id ? "bg-ouro text-ouro-texto" : "border border-white/10 text-apagado hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icone className="h-4 w-4" /> {rotulo}
    </button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Botao id="oficio" rotulo="Ofício de apresentação" Icone={FileText} />
        <Botao id="guia" rotulo="Guia de Encaminhamento Médico" Icone={Stethoscope} />
        <Botao id="emitidos" rotulo="Emitidos" Icone={History} />
      </div>

      {/* Só o documento da aba ativa fica montado — assim a impressão nunca leva o outro junto. */}
      {aba === "oficio" && <OficioJms />}
      {aba === "guia" && <GuiaEncaminhamento />}
      {aba === "emitidos" && <HistoricoJms />}
    </>
  );
}
