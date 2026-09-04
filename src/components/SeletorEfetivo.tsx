"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Buscador de policial reutilizável. Mostra sugestões do /api/efetivo e, ao
   escolher, escreve o nome formatado no padrão dos documentos (ex.:
   "SD PM 169/24 Gleydson Robson Rocha da Silva"). O usuário também pode digitar
   livremente. Recebe/entrega uma string (o campo continua sendo texto livre). */

/* A regra da referência mora em @/lib/refMilitar porque o SERVIDOR usa a
   mesma (o FATD em Word é montado lá). Aqui só se reexporta, para as telas
   que já importam daqui continuarem funcionando. */
export { refMilitar, type MilitarLite } from "@/lib/refMilitar";
import { refMilitar, type MilitarLite } from "@/lib/refMilitar";

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
