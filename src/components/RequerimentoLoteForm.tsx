"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, Users, AlertTriangle } from "lucide-react";
import { usaQuadrinhoOutros, ehModeloAquisicao } from "@/lib/requerimentos";
import { BuscaMilitarMultiplo, nomeBusca, type Militar } from "@/components/docs/Comum";

// quadro "2. PRODUTO CONTROLADO A SER ADQUIRIDO" das folhas de PCE
const CAMPOS_PCE: { key: string; label: string; dica: string }[] = [
  { key: "produto", label: "Produto", dica: "Produto (ex: PISTOLA)" },
  { key: "marca", label: "Marca", dica: "Marca (ex: TAURUS)" },
  { key: "modeloArma", label: "Modelo", dica: "Modelo (ex: G3C)" },
  { key: "calibre", label: "Calibre", dica: "Calibre (ex: 9MM)" },
  { key: "quantidade", label: "Qtd.", dica: "Qtd. (ex: 01)" },
];

/* Requerimento em lote: o P/1 digita UMA vez o que é igual para todo mundo e
   escolhe os militares no buscador — o sistema abre um requerimento por
   militar, cada um com os dados da própria ficha. Mesma dinâmica da viagem em
   grupo das diárias. */

export default function RequerimentoLoteForm({
  modalidade,
  modelo,
  inicial,
}: {
  modalidade: string;
  modelo: string;
  inicial: { amparoLegal: string; infoAdicional: string; modalidadeOutros: string };
}) {
  const router = useRouter();
  const [militares, setMilitares] = useState<Militar[]>([]);
  const [f, setF] = useState<Record<string, string>>({
    amparoLegal: inicial.amparoLegal || "",
    infoAdicional: inicial.infoAdicional || "",
    modalidadeOutros: inicial.modalidadeOutros || "",
    p2Conceito: "",
    p2UltimaPromocao: "",
    p2BgNumero: "",
    p2BgData: "",
    p2Complementares: "",
    produto: "",
    marca: "",
    modeloArma: "",
    calibre: "",
    quantidade: "",
  });
  // página 2 do modelo de cursos: um valor por militar (conceito e última
  // promoção não são iguais entre pessoas)
  const [porMilitar, setPorMilitar] = useState<Record<string, Record<string, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const ehCursos = modelo === "cursos";
  // aquisição de arma (uso restrito/permitido): folha própria, sem amparo
  // legal nem informações adicionais — o que varia é a arma de cada um
  const ehAquisicao = ehModeloAquisicao(modelo);
  const ehOutros = !ehAquisicao && usaQuadrinhoOutros(modalidade);

  function set(k: string, v: string) {
    setF((o) => ({ ...o, [k]: v }));
  }

  function setLinha(id: string, k: string, v: string) {
    setPorMilitar((o) => ({ ...o, [id]: { ...(o[id] || {}), [k]: v } }));
  }

  /* A linha "igual para todos" é atalho, não um valor à parte: escreve de uma
     vez na tabela para o P/1 só ajustar quem foge do padrão. */
  function aplicarATodos(k: string, v: string) {
    set(k, v);
    setPorMilitar((o) => {
      const novo = { ...o };
      for (const m of militares) novo[m.id] = { ...(novo[m.id] || {}), [k]: v };
      return novo;
    });
  }

  function adicionar(m: Militar) {
    setMilitares((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
    // quem entra depois já nasce com o que foi marcado como igual para todos
    setPorMilitar((o) => ({
      ...o,
      [m.id]: {
        p2Conceito: f.p2Conceito,
        p2UltimaPromocao: f.p2UltimaPromocao,
        p2BgNumero: f.p2BgNumero,
        p2BgData: f.p2BgData,
        produto: f.produto,
        marca: f.marca,
        modeloArma: f.modeloArma,
        calibre: f.calibre,
        quantidade: f.quantidade,
        ...(o[m.id] || {}),
      },
    }));
  }

  async function criar(acao: "rascunho" | "enviar") {
    setErro("");
    if (!militares.length) { setErro("Escolha ao menos um militar no buscador."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/requerimentos/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalidade,
          idsPmma: militares.map((m) => m.id),
          acao,
          dados: f,
          porMilitar,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error || "Não foi possível criar."); return; }

      const partes = [
        `${d.total} requerimento(s) criado(s) como ${d.status === "enviado" ? "ENVIADO ao P/1" : "RASCUNHO"}.`,
      ];
      if (d.semFicha) partes.push(`${d.semFicha} militar(es) sem ficha de efetivo foram pulados.`);
      partes.push("O documento de cada um sai pelo botão de gerar, na tela do requerimento.");
      alert(partes.join("\n"));

      router.push("/requerimentos");
      router.refresh();
    } catch {
      setErro("Erro de conexão ao criar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* militares do lote */}
      <section className="ui-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Militares deste requerimento
        </h2>
        <p className="mb-4 text-[12px] text-[#94A3B8]">
          Cada um recebe o seu próprio requerimento, com os dados da ficha dele (nome, endereço,
          matrícula, posto, CPF). O que você preenche abaixo vale para todos.
        </p>
        <BuscaMilitarMultiplo
          selecionados={militares}
          onAdicionar={adicionar}
          onRemover={(id) => setMilitares((l) => l.filter((m) => m.id !== id))}
          rotulo="Militares"
        />
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#94A3B8]">
          <Users className="h-3.5 w-3.5 text-[#D4AF37]" />
          {militares.length === 0
            ? "Nenhum militar escolhido ainda."
            : `${militares.length} militar(es) escolhido(s).`}
        </p>
      </section>

      {/* modalidade OUTROS: especificar */}
      {ehOutros && (
        <section className="ui-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Especifique a modalidade (Outros)
          </h2>
          <p className="mb-3 text-[12px] text-[#94A3B8]">
            Sai entre parênteses no documento, ao lado do quadrinho “OUTROS”.
          </p>
          <input type="text" value={f.modalidadeOutros} onChange={(e) => set("modalidadeOutros", e.target.value)}
            placeholder="Ex: INSCRIÇÃO NO CAP PM"
            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
        </section>
      )}

      {/* Amparo legal e informações adicionais: as folhas de PCE não têm
          esses quadros (o texto da solicitação já vem impresso nelas). */}
      {!ehAquisicao && (
        <>
          {/* amparo legal */}
          <section className="ui-card p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Amparo legal
            </h2>
            <textarea rows={3} value={f.amparoLegal} onChange={(e) => set("amparoLegal", e.target.value)}
              placeholder="Base legal do requerimento (lei, artigo, edital...)"
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
          </section>

          {/* informacoes adicionais */}
          <section className="ui-card p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Informações adicionais
            </h2>
            <textarea rows={4} value={f.infoAdicional} onChange={(e) => set("infoAdicional", e.target.value)}
              placeholder="Descreva o que solicita..."
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
          </section>
        </>
      )}

      {/* aquisição de arma: a arma é de cada um */}
      {ehAquisicao && (
        <section className="ui-card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Produto controlado de cada militar
          </h2>
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            A arma <b>muda de militar para militar</b>. Preencha a linha “igual para todos” para
            adiantar e ajuste quem for diferente na tabela. Ao <b>enviar</b>, é tudo ou nada: se
            faltar dado de alguém, nada é criado e o sistema diz de quem.
          </p>

          <div className="mb-4 rounded-lg border border-white/10 bg-[#0b1626] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              Igual para todos
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {CAMPOS_PCE.map((c) => (
                <input key={c.key} type="text" value={f[c.key]}
                  onChange={(e) => aplicarATodos(c.key, e.target.value)}
                  placeholder={c.dica}
                  className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              ))}
            </div>
          </div>

          {militares.length === 0 ? (
            <p className="text-[12px] text-[#94A3B8]">
              Escolha os militares acima para ajustar um a um.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                    <th className="px-2 py-2 font-semibold">Militar</th>
                    {CAMPOS_PCE.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-semibold">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {militares.map((m) => {
                    const linha = porMilitar[m.id] || {};
                    return (
                      <tr key={m.id} className="border-b border-white/5">
                        <td className="px-2 py-2 text-white">{nomeBusca(m)}</td>
                        {CAMPOS_PCE.map((c) => (
                          <td key={c.key} className="px-2 py-2">
                            <input type="text" value={linha[c.key] ?? ""}
                              onChange={(e) => setLinha(m.id, c.key, e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* pagina 2 - so cursos */}
      {ehCursos && (
        <section className="ui-card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-4 w-1 rounded bg-[#D4AF37]" /> Informações do comandante (pág. 2 — verso)
          </h2>
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Conceito e última promoção <b>mudam de militar para militar</b>. Preencha a linha
            “igual para todos” para adiantar e depois ajuste quem for diferente, na tabela abaixo.
            Requerimento não tem edição depois de criado, então <b>enviar é tudo ou nada</b>: se
            faltar dado de alguém, nada é criado e o sistema diz de quem.
          </p>

          {/* linha "igual para todos": preenche a tabela de uma vez */}
          <div className="mb-4 rounded-lg border border-white/10 bg-[#0b1626] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              Igual para todos
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input type="text" value={f.p2Conceito} onChange={(e) => aplicarATodos("p2Conceito", e.target.value)}
                placeholder="Conceito (ex: EXCEPCIONAL)"
                className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <input type="date" value={f.p2UltimaPromocao} onChange={(e) => aplicarATodos("p2UltimaPromocao", e.target.value)}
                title="Data da última promoção"
                className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <input type="text" value={f.p2BgNumero} onChange={(e) => aplicarATodos("p2BgNumero", e.target.value)}
                placeholder="Nº do BG (ex: 009)"
                className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
              <input type="date" value={f.p2BgData} onChange={(e) => aplicarATodos("p2BgData", e.target.value)}
                title="Data do BG"
                className="w-full rounded-lg border border-white/10 bg-[#0F1B2D] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
            </div>
          </div>

          {militares.length === 0 ? (
            <p className="text-[12px] text-[#94A3B8]">
              Escolha os militares acima para ajustar um a um.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                    <th className="px-2 py-2 font-semibold">Militar</th>
                    <th className="px-2 py-2 font-semibold">Conceito</th>
                    <th className="px-2 py-2 font-semibold">Última promoção</th>
                    <th className="px-2 py-2 font-semibold">Nº do BG</th>
                    <th className="px-2 py-2 font-semibold">Data do BG</th>
                  </tr>
                </thead>
                <tbody>
                  {militares.map((m) => {
                    const linha = porMilitar[m.id] || {};
                    return (
                      <tr key={m.id} className="border-b border-white/5">
                        <td className="px-2 py-2 text-white">{nomeBusca(m)}</td>
                        <td className="px-2 py-2">
                          <input type="text" value={linha.p2Conceito ?? ""}
                            onChange={(e) => setLinha(m.id, "p2Conceito", e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="date" value={linha.p2UltimaPromocao ?? ""}
                            onChange={(e) => setLinha(m.id, "p2UltimaPromocao", e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="text" value={linha.p2BgNumero ?? ""}
                            onChange={(e) => setLinha(m.id, "p2BgNumero", e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="date" value={linha.p2BgData ?? ""}
                            onChange={(e) => setLinha(m.id, "p2BgData", e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-2 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Observação adicional do comandante (igual para todos, opcional)
            </label>
            <textarea rows={3} value={f.p2Complementares} onChange={(e) => set("p2Complementares", e.target.value)}
              placeholder="Só se houver algo além do texto padrão da página 2..."
              className="w-full rounded-lg border border-white/10 bg-[#0b1626] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
          </div>
        </section>
      )}

      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => criar("enviar")} disabled={salvando || !militares.length}
          className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:brightness-110 disabled:opacity-40">
          <Send className="h-4 w-4" />
          {salvando ? "Criando..." : `Criar e enviar (${militares.length})`}
        </button>
        <button onClick={() => criar("rascunho")} disabled={salvando || !militares.length}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 text-sm text-[#94A3B8] transition hover:bg-white/5 hover:text-white disabled:opacity-40">
          <Save className="h-4 w-4" /> Criar como rascunho
        </button>
      </div>
    </div>
  );
}
