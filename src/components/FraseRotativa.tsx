"use client";

import { useState, useEffect } from "react";

const MOTIVACIONAIS = [
  "A excelência é resultado da disciplina diária.",
  "O sucesso da organização depende da qualidade da administração.",
  "Quem organiza hoje evita problemas amanhã.",
  "A missão é difícil, mas a dedicação faz a diferença.",
  "O trabalho silencioso da P1 sustenta a operacionalidade da tropa.",
  "Disciplina é a ponte entre metas e realizações.",
  "Servir com honra é o maior dos compromissos.",
  "A ordem e o método vencem o caos.",
  "Cada detalhe bem cuidado fortalece a corporação.",
  "O preparo de hoje é a vitória de amanhã.",
];

const VERSICULOS = [
  { t: "Posso todas as coisas naquele que me fortalece.", r: "Filipenses 4:13" },
  { t: "Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.", r: "Eclesiastes 9:10" },
  { t: "Não nos cansemos de fazer o bem.", r: "Gálatas 6:9" },
  { t: "O Senhor é a minha força e o meu escudo.", r: "Salmos 28:7" },
  { t: "Se o Senhor não guardar a cidade, em vão vigia a sentinela.", r: "Salmos 127:1" },
  { t: "Sede fortes e corajosos.", r: "Josué 1:9" },
  { t: "O que faz justiça e juízo é mais aceitável ao Senhor do que sacrifício.", r: "Provérbios 21:3" },
];

type Frase = { texto: string; ref: string | null };

// Sorteia SO no cliente (dentro de useEffect), evitando divergencia
// entre o HTML do servidor e o do cliente (erro de hydration).
export default function FraseRotativa() {
  const [frase, setFrase] = useState<Frase | null>(null);

  useEffect(() => {
    if (Math.random() < 0.5) {
      const v = VERSICULOS[Math.floor(Math.random() * VERSICULOS.length)];
      setFrase({ texto: `"${v.t}"`, ref: v.r });
    } else {
      const m = MOTIVACIONAIS[Math.floor(Math.random() * MOTIVACIONAIS.length)];
      setFrase({ texto: m, ref: null });
    }
  }, []);

  return (
    <div className="mb-5 min-h-[58px] rounded-xl border border-white/10 border-l-[3px] border-l-[#D4AF37] bg-gradient-to-r from-[#D4AF37]/10 to-transparent px-5 py-3.5 print:hidden">
      {frase ? (
        <>
          <p className="text-sm italic text-[#e8edf5]">{frase.texto}</p>
          {frase.ref && (
            <p className="mt-1 text-xs font-semibold not-italic text-[#D4AF37]">{frase.ref}</p>
          )}
        </>
      ) : (
        <p className="text-sm italic text-[#94A3B8]">Carregando...</p>
      )}
    </div>
  );
}
