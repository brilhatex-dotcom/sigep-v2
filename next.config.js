/** @type {import('next').NextConfig} */

// CSP moderada: bloqueia enquadrar o site (clickjacking), scripts/objetos de
// hosts externos e conexoes para fora. Mantem 'unsafe-inline' porque o app usa
// estilos/scripts inline do Next; da pra apertar com nonce depois.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "font-src 'self' data:",
  "connect-src 'self'",
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