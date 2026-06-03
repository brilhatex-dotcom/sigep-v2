// ==========================================================
//  Auxiliares do Plano de Ferias.
//  Lida com datas em formato cru do Sheets ou ISO, calcula
//  status da equipe (Concluida / Em Ferias / Agendada) e textos
//  de "X dias".
// ==========================================================

// "hoje" no fuso de Brasilia, zerado na meia-noite.
export function hojeBR(): Date {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  agora.setHours(0, 0, 0, 0);
  return agora;
}

// Converte data (cru do Sheets / ISO / dd/mm/aaaa) em Date (meia-noite local).
export function paraData(valor: string | null): Date | null {
  if (!valor || !String(valor).trim()) return null;
  const s = String(valor).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dataBR(valor: string | null): string {
  const d = paraData(valor);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function diffDias(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / 86400000);
}

export type Periodo = { inicio: Date | null; fim: Date | null; apres: string | null };

export type StatusEquipe = {
  chave: "concluida" | "em_ferias" | "agendada" | "indefinida";
  rotulo: string;
  detalhe: string;
};

// Recebe os periodos da equipe e devolve o status agregado.
export function statusEquipe(periodos: Periodo[]): StatusEquipe {
  const hoje = hojeBR();
  const validos = periodos.filter((p) => p.inicio && p.fim);
  if (validos.length === 0) {
    return { chave: "indefinida", rotulo: "Sem datas", detalhe: "" };
  }

  // em ferias agora?
  for (const p of validos) {
    if (p.inicio! <= hoje && hoje <= p.fim!) {
      const restantes = diffDias(hoje, p.fim!);
      return {
        chave: "em_ferias",
        rotulo: "Em Férias",
        detalhe: restantes <= 0 ? "último dia" : `${restantes} dia(s) restante(s)`,
      };
    }
  }

  // algum periodo ainda no futuro? -> agendada
  const futuros = validos.filter((p) => p.inicio! > hoje);
  if (futuros.length) {
    const prox = futuros.sort((a, b) => a.inicio!.getTime() - b.inicio!.getTime())[0];
    const faltam = diffDias(hoje, prox.inicio!);
    return {
      chave: "agendada",
      rotulo: "Agendada",
      detalhe: `Sai em ${faltam} dia(s)`,
    };
  }

  // todos no passado
  return { chave: "concluida", rotulo: "Concluída", detalhe: "Concluída" };
}

export const CORES_STATUS: Record<string, string> = {
  concluida: "bg-gray-100 text-gray-600",
  em_ferias: "bg-amber-100 text-amber-700",
  agendada: "bg-emerald-100 text-emerald-700",
  indefinida: "bg-slate-100 text-slate-500",
};
