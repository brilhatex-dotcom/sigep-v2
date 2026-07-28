/** @type {import('next').NextConfig} */

// CSP moderada: bloqueia enquadrar o site (clickjacking), scripts/objetos de
// hosts externos e conexoes para fora. Mantem 'unsafe-inline' porque o app usa
// estilos/scripts inline do Next; da pra apertar com nonce depois.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.r2.cloudflarestorage.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "font-src 'self' data:",
  // O chat envia o anexo do NAVEGADOR direto para o Cloudflare R2 (a Vercel
  // corta requisicoes acima de ~4,5 MB). Sem liberar o R2 aqui, a propria
  // politica do site bloqueia a conexao antes de sair - o erro no console e
  // "violates ... connect-src 'self'". So o dominio do R2 entra na lista.
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },                 // nao pode ser aberto dentro de outro site
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // empacota os templates .docx junto das serverless functions que os leem,
    // senao o fs.readFileSync de /public quebra em producao (Vercel) -> 500 ENOENT
    outputFileTracingIncludes: {
      "/api/requerimentos/[id]/gerar": ["./public/templates/**"],
      "/api/joe/[id]/rene": ["./public/templates/**"],
    },
  },
};

module.exports = nextConfig;