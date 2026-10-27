"use client";

import Link from "next/link";
import { citacoesDeBG, linkDoBG } from "@/lib/documentosOficiais";

/* Texto livre (ex.: "01/01/2015 BG 004", "BG nº 134 de 22/07/2022") com cada
   "BG nº" virando link para o boletim no mural de Documentos Oficiais. Se o
   BG ainda não estiver no mural, a tela de lá diz isso (e o P/1 já o põe). */
export default function TextoComBG({ texto }: { texto: string }) {
  const cits = citacoesDeBG(texto);
  if (!cits.length) return <>{texto}</>;
  const partes: React.ReactNode[] = [];
  let pos = 0;
  cits.forEach((c, i) => {
    if (c.inicio > pos) partes.push(texto.slice(pos, c.inicio));
    partes.push(
      <Link key={i} href={linkDoBG(c.numero, c.ano)} title="Abrir este BG no mural de Documentos Oficiais"
        className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300">
        {texto.slice(c.inicio, c.fim)}
      </Link>,
    );
    pos = c.fim;
  });
  if (pos < texto.length) partes.push(texto.slice(pos));
  return <>{partes}</>;
}
