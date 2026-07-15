"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Buscador de policial reutilizável. Mostra sugestões do /api/efetivo e, ao
   escolher, escreve o nome formatado no padrão dos documentos (ex.:
   "SD PM 169/24 Gleydson Robson Rocha da Silva"). O usuário também pode digitar
   livremente. Recebe/entrega uma string (o campo continua sendo texto livre). */

export type MilitarLite = { id: string; postoGrad: string; nome: string; nomeGuerra: string; numeroBarra: string; quadro?: string };

function abrev(p: string): string {
  const m: Record<string, string> = {
    "coronel": "CEL", "tenente-coronel": "TEN CEL", "tenente coronel": "TEN CEL", "major": "MAJ",
    "capitão": "CAP", "capitao": "CAP", "1º tenente": "1º TEN", "1° tenente": "1º TEN",
    "2º tenente": "2º TEN", "2° tenente": "2º TEN", "aspirante a oficial": "ASP OF", "aspirante": "ASP OF",
    "subtenente": "SUB TEN", "1º sargento": "1º SGT", "2º sargento": "2º SGT", "3º sargento": "3º SGT",
    "cabo": "CB", "soldado": "SD",
  };
  return m[(p || "").trim().toLowerCase()] ?? (p || "").trim().toUpperCase();
}
// Referência oficial: POSTO QUADRO Nº/BARRA Nome Completo (ex.: "SD PM 169/24 Gleydson ...")
export function refMilitar(m: MilitarLite): string {
  const posto = abrev(m.postoGrad);
  const q = (m.quadro || "PM").trim() || "PM";
  const barra = (m.numeroBarra || "").trim();
  const nome = (m.nome || m.nomeGuerra || "").trim();
  return [posto, q, barra, nome].filter(Boolean).join(" ").trim();
}

export default function SeletorEfetivo({
  value, onChange, efetivo, placeholder,
}: {
  value: string; onChange: (v: string) => void; efetivo: MilitarLite[]; placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false); };
    window.addEventListener("click", fora);
    return () => window.removeEventListener("click", fora);
  }, []);

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = efetivo;
    if (!t) return base.slice(0, 8);
    return base.filter((m) => `${m.postoGrad} ${m.nome} ${m.nomeGuerra} ${m.numeroBarra} ${m.quadro || ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [busca, efetivo]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setBusca(e.target.value); setAberto(true); }}
        onFocus={() => { setBusca(value); setAberto(true); }}
        placeholder={placeholder || "Digite ou busque o policial…"}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {aberto && sugestoes.length > 0 && (
        <div className="sel-ef-sug">
          {sugestoes.map((m) => {
            const ref = refMilitar(m);
            return (
              <button key={m.id} type="button" onClick={() => { onChange(ref); setAberto(false); }}>
                <b>{ref}</b>
              </button>
            );
          })}
        </div>
      )}
      <style>{`
        .sel-ef-sug{ position:absolute; z-index:40; left:0; right:0; top:calc(100% + 4px); background:#0F1B2D; border:1px solid #2b3f63; border-radius:9px; padding:4px; max-height:260px; overflow:auto; box-shadow:0 10px 30px rgba(0,0,0,.5); }
        .sel-ef-sug button{ display:block; width:100%; text-align:left; background:none; border:none; color:#cdd9ea; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; }
        .sel-ef-sug button:hover{ background:#16233f; color:#fff; }
      `}</style>
    </div>
  );
}
