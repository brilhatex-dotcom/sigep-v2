"use client";

import { useState } from "react";
import { X, Printer, Pencil } from "lucide-react";

export type DadosMemorando = {
  numero: string;
  postoGrad: string;
  numeroBarra: string;
  nome: string;
  inicioBR: string;
  apresentacaoBR: string;
  diasFerias: number;
};

function hojeExtenso() {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function MemorandoFerias({
  dados,
  ano,
  onFechar,
}: {
  dados: DadosMemorando;
  ano: string;
  onFechar: () => void;
}) {
  const [editando, setEditando] = useState(false);

  const [m, setM] = useState({
    numero: dados.numero,
    cidadeData: `Presidente Dutra-MA, ${hojeExtenso()}.`,
    cmt: "Cmt. do 18º BPM",
    de: "Asp. Of. PM Chefe da 1ª Seção do 18º BPM.",
    ao: `${dados.postoGrad} PM nº ${dados.numeroBarra} - ${dados.nome}.`,
    assunto: `Concessão de Férias (${dados.diasFerias} dias).`,
    inicio: dados.inicioBR,
    apresentacao: dados.apresentacaoBR,
    dias: String(dados.diasFerias),
    exercicio: String(Number(ano) - 1),
    assinatura: "Chefe da 1ª Seção (P1) do 18º BPM",
  });

  function set<K extends keyof typeof m>(k: K, v: string) {
    setM((p) => ({ ...p, [k]: v }));
  }

  const E = ({
    campo,
    multiline,
    classe,
    size,
  }: {
    campo: keyof typeof m;
    multiline?: boolean;
    classe?: string;
    size?: number;
  }) =>
    editando ? (
      multiline ? (
        <textarea
          value={m[campo]}
          onChange={(e) => set(campo, e.target.value)}
          className={`w-full rounded border border-amber-300 bg-amber-50 px-1 ${classe ?? ""}`}
          rows={2}
        />
      ) : (
        <input
          value={m[campo]}
          onChange={(e) => set(campo, e.target.value)}
          size={size}
          className={`rounded border border-amber-300 bg-amber-50 px-1 ${classe ?? ""}`}
        />
      )
    ) : (
      <span className={classe}>{m[campo]}</span>
    );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-sigep-navy px-4 py-3 text-white print:hidden">
        <span className="font-semibold">Memorando — Concessão de Férias</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setEditando((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium hover:bg-amber-600"
          >
            <Pencil className="h-4 w-4" /> {editando ? "Pronto" : "Editar tudo"}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
          <button
            onClick={onFechar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium hover:bg-red-600"
          >
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>

      <div className="mx-auto my-6 max-w-3xl bg-white p-10 text-[13px] leading-relaxed text-black shadow-lg print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-center justify-between">
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-300 text-[8px] text-gray-400 print:border-transparent">
            BRASÃO PMMA
          </div>
          <div className="px-2 text-center text-[12px] font-bold uppercase leading-tight">
            <p>Estado do Maranhão</p>
            <p>Secretaria de Estado da Segurança Pública</p>
            <p>Polícia Militar do Maranhão</p>
            <p>Comando do Policiamento de Área I/2</p>
            <p>18º Batalhão de Polícia Militar</p>
            <p className="text-[10px] font-normal normal-case">
              Rua do Sol, S/N, Cohab, Presidente Dutra-MA, CEP 65.760-000 · (99) 3663-3892 · 18batalhaopmma@gmail.com
            </p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-300 text-[8px] text-gray-400 print:border-transparent">
            BRASÃO 18º BPM
          </div>
        </div>

        <hr className="my-4 border-black" />

        <div className="mb-4 flex justify-between">
          <span className="font-semibold">VISTO</span>
          <div className="text-right">
            <E campo="cidadeData" size={38} classe="text-right" />
            <p className="mt-8">
              <E campo="cmt" size={20} />
            </p>
          </div>
        </div>

        <p className="mb-4 text-center font-bold">
          Memorando nº <E campo="numero" size={5} />/{ano} – 18º BPM
        </p>

        <table className="mb-4 w-full">
          <tbody>
            <tr>
              <td className="w-16 align-top font-bold">Do:</td>
              <td><E campo="de" multiline classe="w-full" /></td>
            </tr>
            <tr>
              <td className="align-top font-bold">Ao:</td>
              <td><E campo="ao" multiline classe="w-full" /></td>
            </tr>
            <tr>
              <td className="align-top font-bold">Assunto:</td>
              <td><E campo="assunto" classe="w-full" /></td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify indent-8">
          Informo a Vossa Senhoria, para conhecimento, que a partir do dia{" "}
          <E campo="inicio" size={10} classe="text-center font-semibold" />{" "}
          encontra-se de Férias Regulamentares (<E campo="dias" size={2} /> dias)
          referente ao exercício de <E campo="exercicio" size={5} />, devendo
          apresentar-se pronto para o serviço Policial Militar no dia{" "}
          <E campo="apresentacao" size={10} classe="text-center font-semibold" />.
        </p>

        <p className="mt-12 text-center">
          Atenciosamente,
          <br /><br /><br />
          _______________________________________
          <br />
          <E campo="assinatura" size={32} classe="text-center" />
        </p>
      </div>
    </div>
  );
}
