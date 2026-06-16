"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/* =========================================================================
   Botao "Copiar dados" — copia TEXTO PURO (sem cor/realce) para colar limpo
   no SEI, Word, e-mail. Formato:

     Praca:    Cb PM nº 775/17 Josué, mat. 2648228, ID PMMA 858946
     Oficial:  Maj QOE Herbert, mat. ..., ID PMMA ...   (sem nº/barra)

   Quadro (QOE/QOEM) so aparece para oficiais; vazio => QOEM por padrao.
   ========================================================================= */

type Dados = {
  postoGrad: string | null;
  numeroBarra: string | null;
  nomeGuerra: string | null;
  nome: string | null;
  matricula: string | null;
  id: string | null;
  quadro: string | null;
  lotacao: string | null;
};

// Tabela de abreviacao dos postos/graduacoes da PMMA.
const ABREV: { teste: RegExp; sigla: string; oficial: boolean }[] = [
  { teste: /tenente[-\s]?coronel|ten[-\s]?cel/i, sigla: "Ten-Cel", oficial: true },
  { teste: /coronel|\bcel\b/i, sigla: "Cel", oficial: true },
  { teste: /major|\bmaj\b/i, sigla: "Maj", oficial: true },
  { teste: /capit[aã]o|\bcap\b/i, sigla: "Cap", oficial: true },
  { teste: /1.?\s*tenente|primeiro\s*tenente|1.?\s*ten/i, sigla: "1º Ten", oficial: true },
  { teste: /2.?\s*tenente|segundo\s*tenente|2.?\s*ten/i, sigla: "2º Ten", oficial: true },
  { teste: /aspirante|asp/i, sigla: "Asp Of", oficial: true },
  { teste: /subtenente|subten|\bst\b/i, sigla: "Subten", oficial: false },
  { teste: /1.?\s*sargento|primeiro\s*sargento|1.?\s*sgt/i, sigla: "1º Sgt", oficial: false },
  { teste: /2.?\s*sargento|segundo\s*sargento|2.?\s*sgt/i, sigla: "2º Sgt", oficial: false },
  { teste: /3.?\s*sargento|terceiro\s*sargento|3.?\s*sgt/i, sigla: "3º Sgt", oficial: false },
  { teste: /cabo|\bcb\b/i, sigla: "Cb", oficial: false },
  { teste: /soldado|\bsd\b/i, sigla: "Sd", oficial: false },
];

function soDigitos(v: string | null): string {
  return String(v || "").replace(/\D/g, "");
}

function capitaliza(s: string | null): string {
  const t = (s || "").trim();
  if (!t) return "";
  // Capitaliza cada palavra (PAULO ROBERTO -> Paulo Roberto).
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function maiusculas(s: string | null): string {
  return (s || "").trim().toUpperCase();
}

function montarTexto(d: Dados): string {
  const posto = (d.postoGrad || "").trim();
  const achado = ABREV.find((a) => a.teste.test(posto));
  const sigla = achado ? achado.sigla : posto;
  const oficial = achado ? achado.oficial : false;
  // Nome completo em maiúsculas; nome de guerra só se não houver nome completo
  const nomeCompleto = maiusculas(d.nome);
  const guerra = nomeCompleto || maiusculas(d.nomeGuerra);
  const barra = (d.numeroBarra || "").trim();
  const temBarra = /\d/.test(barra);

  let ident = "";
  if (oficial) {
    const quadro = (d.quadro || "").trim() || "QOEM";
    ident = `${sigla} ${quadro} ${guerra}`.replace(/\s+/g, " ").trim();
  } else {
    const partes = [sigla, "PM"];
    if (temBarra) partes.push("nº", barra);
    partes.push(guerra);
    ident = partes.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  const mat = soDigitos(d.matricula);
  const id = soDigitos(d.id);
  const lotacao = (d.lotacao || "").trim();

  const fim: string[] = [];
  if (mat) fim.push(`matrícula n° ${mat}`);
  if (id) fim.push(`ID nº ${id}`);
  if (lotacao) fim.push(`do ${lotacao}`);

  return fim.length ? `${ident}, ${fim.join(", ")}` : ident;
}

export default function CopiarDados({ dados }: { dados: Dados }) {
  const [copiado, setCopiado] = useState(false);
  const texto = montarTexto(dados);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // fallback para navegadores/contextos sem clipboard API
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <button
      onClick={copiar}
      title={texto}
      className="inline-flex items-center gap-2 rounded-lg border border-[#2b3f63] bg-[#16243a] px-4 py-2 text-sm font-semibold text-[#E8EEF6] transition hover:border-[#D4AF37]"
    >
      {copiado ? <Check className="h-4 w-4 text-[#46c47e]" /> : <Copy className="h-4 w-4" />}
      {copiado ? "Copiado!" : "Copiar dados"}
    </button>
  );
}
