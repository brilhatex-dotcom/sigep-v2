"use client";

import { useMemo } from "react";

// Gera N gotas com posicao, duracao e atraso aleatorios.
export default function Chuva({ quantidade = 60 }: { quantidade?: number }) {
  const gotas = useMemo(
    () =>
      Array.from({ length: quantidade }).map(() => ({
        left: Math.random() * 100,
        dur: 0.5 + Math.random() * 0.8,
        delay: Math.random() * 3,
        op: 0.2 + Math.random() * 0.5,
        h: 40 + Math.random() * 60,
      })),
    [quantidade]
  );

  return (
    <div className="chuva" aria-hidden>
      {gotas.map((g, i) => (
        <span
          key={i}
          className="gota"
          style={{
            left: `${g.left}%`,
            height: `${g.h}px`,
            opacity: g.op,
            animationDuration: `${g.dur}s`,
            animationDelay: `${g.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
