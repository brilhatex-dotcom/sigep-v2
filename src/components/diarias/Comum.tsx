"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

/* Peças compartilhadas pelas fichas da área de Diárias (Cadastro de Credor e
   Controle Individual): o cabeçalho oficial, o buscador de militar e o campo
   editável direto na folha. */

export type Militar = {
  id: string;
  postoGrad?: string | null;
  numeroBarra?: string | null;
  nome?: string | null;
  nomeGuerra?: string | null;
  matricula?: string | null;
};

export function nomeBusca(m: Militar) {
  return [m.postoGrad, m.nomeGuerra || m.nome].filter(Boolean).join(" ");
}

/* Buscador do efetivo. Depois de escolhido, mostra quem esta selecionado e
   deixa trocar. */
export function BuscaMilitar({
  sel, onEscolher, onLimpar, rotulo = "Militar",
}: {
  sel: Militar | null;
  onEscolher: (m: Militar) => void;
  onLimpar: () => void;
  rotulo?: string;
}) {
  const [efetivo, setEfetivo] = useState<Militar[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/efetivo").then((r) => (r.ok ? r.json() : null))
      .then((d) => setEfetivo((d?.efetivo || d || []) as Militar[])).catch(() => {});
  }, []);

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return efetivo.filter((m) =>
      (nomeBusca(m) + " " + (m.nome || "") + " " + (m.matricula || "")).toLowerCase().includes(t)
    ).slice(0, 8);
  }, [busca, efetivo]);

  if (sel) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">
          {nomeBusca(sel)}{sel.matricula ? ` · mat ${sel.matricula}` : ""}
        </span>
        <button onClick={onLimpar} className="text-xs text-[#94A3B8] underline hover:text-white">trocar militar</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs text-[#94A3B8]">{rotulo}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar militar por nome ou matrícula..."
          className="w-full rounded-lg border border-white/10 bg-[#0b1626] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
      </div>
      {busca.trim() !== "" && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1626] shadow-xl">
          {resultados.length === 0 ? <div className="px-3 py-2 text-xs text-[#94A3B8]">Nenhum militar.</div> :
            resultados.map((m) => (
              <button key={m.id} onClick={() => { setBusca(""); onEscolher(m); }}
                className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                {nomeBusca(m)} {m.matricula && <span className="text-xs text-[#94A3B8]">mat {m.matricula}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* Campo editavel direto na folha. Guarda so o TEXTO (nao HTML), porque o valor
   pode voltar para o cadastro do militar. O pontilhado marca onde clicar na
   tela e some na impressao. */
export function Campo({
  valor, onChange, min, negrito, centro,
}: {
  valor: string; onChange: (v: string) => void; min?: string; negrito?: boolean; centro?: boolean;
}) {
  return (
    <span
      className="campo-ed"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        display: "inline-block", minWidth: min || "30mm",
        borderBottom: "0.5pt dotted #bbb",
        fontWeight: negrito ? "bold" : undefined,
        textAlign: centro ? "center" : undefined,
      }}
      onBlur={(e) => onChange((e.currentTarget.textContent || "").trim())}
    >
      {valor}
    </span>
  );
}

/* Cabecalho oficial do 18º BPM, igual ao dos documentos em Word. */
export function Cabecalho() {
  const esconde = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).style.visibility = "hidden";
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
        <img src="/brasoes/pmma-190.jpg" alt="" style={{ width: "24mm", height: "20mm", objectFit: "contain" }} onError={esconde} />
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.15 }}>
          <img src="/brasoes/armas-ma.png" alt="" style={{ height: "14mm", objectFit: "contain", display: "block", margin: "0 auto 1mm" }} onError={esconde} />
          <p style={{ margin: 0 }}>ESTADO DO MARANHÃO</p>
          <p style={{ margin: 0 }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
          <p style={{ margin: 0 }}>POLÍCIA MILITAR DO MARANHÃO</p>
          <p style={{ margin: 0 }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
          <p style={{ margin: 0 }}>18º BATALHÃO DE POLICIA MILITAR</p>
        </div>
        <img src="/brasoes/brasao-18bpm.png" alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} onError={esconde} />
      </div>
      <p style={{ textAlign: "center", fontSize: "9pt", margin: "1mm 0 0", lineHeight: 1.2 }}>
        Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />
        <b>TELEFAX: (99) 98497-1918(Permanência) – 18batalhaopmma@gmail.com</b>
      </p>
    </>
  );
}

/* Estilo comum da folha A4 e dos campos editaveis. Fica num lugar so para as
   duas fichas imprimirem igual. */
export const ESTILO_FOLHA = `
  .campo-ed:empty:before { content: "\\00a0"; }
  .campo-ed:hover, .campo-ed:focus { background: #fdf6da; outline: none; }
  @media print {
    .campo-ed { background: transparent !important; border-bottom-color: transparent !important; }
    .folha-diaria { margin: 0 !important; width: 100% !important; min-height: 0 !important; padding: 8mm 10mm !important; box-shadow: none !important; }
    @page { size: A4; margin: 0; }
  }
`;

export const FOLHA_A4: React.CSSProperties = {
  width: "210mm", minHeight: "297mm", padding: "12mm 14mm",
  fontFamily: "Times New Roman, Times, serif", fontSize: "12pt", lineHeight: 1.4,
};
