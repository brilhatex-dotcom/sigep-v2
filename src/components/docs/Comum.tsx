"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import CarimboSigep from "@/components/CarimboSigep";
import { padronizarBrasao } from "@/lib/imagem";

/* Peças compartilhadas pelos documentos em folha branca (Diárias, Guia JMS,
   Ofício): cabeçalho oficial, buscador de militar, campo editável na folha e
   bloco de assinatura do Comandante.

   Cada documento tem o seu cabeçalho: o brasão da esquerda e a linha de
   contato mudam de um para o outro, então vêm por parâmetro. */

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

/* Buscador do efetivo. Depois de escolhido, mostra quem está selecionado e
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

/* Campo editável direto na folha. Guarda só o TEXTO (não HTML), porque o valor
   pode voltar para o cadastro do militar. O pontilhado marca onde clicar na
   tela e some na impressão. */
export function Campo({
  valor, onChange, min, negrito, centro, inline,
}: {
  valor: string; onChange: (v: string) => void; min?: string;
  negrito?: boolean; centro?: boolean;
  /* `inline` faz o texto fluir junto com o parágrafo (respeitando recuo e
     justificação), em vez de virar um bloco próprio. Use em textos corridos. */
  inline?: boolean;
}) {
  return (
    <span
      className="campo-ed"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        display: inline ? "inline" : "inline-block",
        minWidth: inline ? undefined : (min || "30mm"),
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

/* Cabeçalho oficial do 18º BPM.

   Os três brasões vêm da MESMA configuração da Escala de Serviço
   (/api/escala-brasoes) e são CLICÁVEIS: clicar abre o seletor de imagem e a
   troca vale em todos os computadores e em todos os documentos de uma vez.

   Isso existe principalmente pela logo da esquerda — a do aniversário da PMMA
   (190 anos), que se renova todo ano. Trocar num documento troca em todos, e
   também na escala, sem precisar mexer no código. */

const PADRAO_BRASOES = {
  pmma: "/brasoes/pmma-190.jpg",
  ma: "/brasao-estado-ma.png",
  bpm: "/brasoes/brasao-18bpm.png",
};
type ChaveBrasao = keyof typeof PADRAO_BRASOES;

export function Cabecalho({
  contato = "TELEFAX: (99) 98497-1918(Permanência) – 18batalhaopmma@gmail.com",
}: {
  contato?: string;
}) {
  const [brasoes, setBrasoes] = useState(PADRAO_BRASOES);

  useEffect(() => {
    fetch("/api/escala-brasoes").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.brasoes) setBrasoes({ ...PADRAO_BRASOES, ...d.brasoes }); })
      .catch(() => {});
  }, []);

  const trocar = (chave: ChaveBrasao) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const leitor = new FileReader();
      leitor.onload = async () => {
        // Padroniza o tamanho antes de gravar, senão a imagem vai inteira para
        // o banco e engorda a configuração.
        const valor = await padronizarBrasao(chave, String(leitor.result));
        setBrasoes((b) => {
          const novo = { ...b, [chave]: valor };
          fetch("/api/escala-brasoes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brasoes: novo }),
          }).catch(() => {});
          return novo;
        });
      };
      leitor.readAsDataURL(f);
    };
    inp.click();
  };

  const esconde = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).style.visibility = "hidden";
  };

  const Brasao = ({ chave, largura, altura }: { chave: ChaveBrasao; largura: string; altura: string }) => (
    <img
      src={brasoes[chave]} alt=""
      onClick={() => trocar(chave)}
      title="Clique para trocar esta imagem (vale para todos os documentos)"
      style={{ width: largura, height: altura, objectFit: "contain", cursor: "pointer" }}
      onError={esconde}
    />
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
        <Brasao chave="pmma" largura="24mm" altura="20mm" />
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.15 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
            <Brasao chave="ma" largura="auto" altura="15mm" />
          </div>
          <p style={{ margin: 0 }}>ESTADO DO MARANHÃO</p>
          <p style={{ margin: 0 }}>SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA</p>
          <p style={{ margin: 0 }}>POLÍCIA MILITAR DO MARANHÃO</p>
          <p style={{ margin: 0 }}>COMANDO DO POLICIAMENTO DE ÁREA I/2</p>
          <p style={{ margin: 0 }}>18º BATALHÃO DE POLICIA MILITAR</p>
        </div>
        <Brasao chave="bpm" largura="20mm" altura="20mm" />
      </div>
      <p style={{ textAlign: "center", fontSize: "9pt", margin: "1mm 0 0", lineHeight: 1.2 }}>
        Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP-65.760-000<br />
        <b>{contato}</b>
      </p>
    </>
  );
}

/* ---------- assinatura do Comandante ---------- */

export type ModoAss = "imagem" | "sigep" | "gov" | "branco";

const ROTULO_ASS: Record<ModoAss, string> = {
  imagem: "Assinatura digitalizada",
  sigep: "Carimbo SIGEP",
  gov: "Espaço p/ Gov.br",
  branco: "Em branco",
};

/* Escolha de como o Comandante assina AQUELE documento. */
export function SeletorAssinatura({
  modo, onChange, opcoes,
}: {
  modo: ModoAss; onChange: (m: ModoAss) => void; opcoes: ModoAss[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[#94A3B8]">Assinatura do Comandante:</span>
      {opcoes.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded px-2 py-1 text-xs transition ${
            modo === o ? "bg-[#D4AF37] text-[#1a1205]" : "border border-white/10 text-[#94A3B8] hover:text-white"
          }`}>
          {ROTULO_ASS[o]}
        </button>
      ))}
    </div>
  );
}

/* Bloco de assinatura na folha: imagem digitalizada, carimbo da avançada
   SIGEP, espaço reservado para o Gov.br (a assinatura entra depois, no PDF)
   ou em branco. */
export function BlocoAssinatura({
  modo, nome, cargo, assinatura = "/brasoes/assinatura-cmt.png", largura = "52mm",
}: {
  modo: ModoAss; nome: string; cargo: string; assinatura?: string; largura?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      {modo === "sigep" ? (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
          <CarimboSigep nome={nome} cargo={cargo} largura={largura} />
        </div>
      ) : modo === "imagem" ? (
        <img src={assinatura} alt="" style={{ height: "18mm", objectFit: "contain", display: "block", margin: "0 auto" }}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
      ) : (
        // "gov" reserva mais altura: a assinatura é aplicada depois no PDF.
        <div style={{ height: modo === "gov" ? "22mm" : "16mm" }} />
      )}
      <p style={{ margin: 0, fontWeight: "bold" }}>{nome}</p>
      <p style={{ margin: 0, fontWeight: "bold" }}>{cargo}</p>
    </div>
  );
}

/* Estilo comum da folha A4 e dos campos editáveis, num lugar só para todos os
   documentos imprimirem igual. */
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

/* Data por extenso: "7 de agosto de 2026". */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function dataPorExtenso(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* "2026-08-10" -> "10/08/2026" */
export function brData(iso: string) {
  return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}
