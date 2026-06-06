"use client";

import { useEffect, useState } from "react";

// Relogio + data atual, fuso de Brasilia. Atualiza a cada segundo.
export default function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () =>
      setAgora(
        new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
        )
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!agora) {
    return <span className="text-sm text-[#94A3B8]">--:--:--</span>;
  }

  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const meses = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const hh = String(agora.getHours()).padStart(2, "0");
  const mm = String(agora.getMinutes()).padStart(2, "0");
  const ss = String(agora.getSeconds()).padStart(2, "0");

  return (
    <div className="text-right leading-tight">
      <p className="font-mono text-sm font-semibold text-white">
        {hh}:{mm}
        <span className="text-[#94A3B8]">:{ss}</span>
      </p>
      <p className="text-[11px] text-[#94A3B8]">
        {dias[agora.getDay()]}, {agora.getDate()} {meses[agora.getMonth()]}{" "}
        {agora.getFullYear()}
      </p>
    </div>
  );
}
