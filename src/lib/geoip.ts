/* Geolocalização aproximada por IP (grátis, sem chave/cadastro). Complementa o
   GPS na auditoria de tentativas de login: mesmo quem nega a localização deixa
   a cidade/UF aproximada pelo IP. Provedor: ipwho.is (HTTPS). Best-effort —
   qualquer falha/timeout devolve "" e não atrapalha o login. */

// IPs privados/loopback não têm geolocalização pública — nem tenta.
function ehPrivado(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fc|fd)/i.test(ip);
}

export async function geoPorIp(ip: string): Promise<string> {
  if (!ip || ip === "desconhecido" || ehPrivado(ip)) return "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return "";
    const d: any = await r.json();
    if (!d || d.success === false) return "";
    const local = [d.city, d.region, d.country].filter(Boolean).join(", ");
    const coord = (d.latitude != null && d.longitude != null) ? ` (${d.latitude},${d.longitude})` : "";
    const isp = d.connection?.isp ? ` · ISP ${String(d.connection.isp).slice(0, 60)}` : "";
    return local ? `IP-geo ${local}${coord}${isp}` : "";
  } catch {
    return "";
  }
}
