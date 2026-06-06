// Auxiliares de data do dashboard. Datas vem como texto do banco.

export function hojeBR(): Date {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  d.setHours(0, 0, 0, 0);
  return d;
}

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

// idade atual a partir da data de nascimento
export function idade(nasc: Date, ref: Date): number {
  let i = ref.getFullYear() - nasc.getFullYear();
  const m = ref.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nasc.getDate())) i--;
  return i;
}

// dias ate o proximo aniversario (0 = hoje)
export function diasAteAniversario(nasc: Date, ref: Date): number {
  const prox = new Date(ref.getFullYear(), nasc.getMonth(), nasc.getDate());
  if (prox < ref) prox.setFullYear(ref.getFullYear() + 1);
  return diffDias(ref, prox);
}

// tempo de servico em anos/meses a partir da data de incorporacao
export function tempoServico(incorp: Date, ref: Date): { anos: number; meses: number } {
  let anos = ref.getFullYear() - incorp.getFullYear();
  let meses = ref.getMonth() - incorp.getMonth();
  if (ref.getDate() < incorp.getDate()) meses--;
  if (meses < 0) { anos--; meses += 12; }
  return { anos: Math.max(0, anos), meses: Math.max(0, meses) };
}
