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
  // camera/microfone liberados só para o PRÓPRIO site (self) — o chat tem
  // ligação e chamada de vídeo. Com "camera=()" o navegador negava o acesso
  // mesmo com o usuário autorizando. geolocation idem: o login registra a
  // posição na auditoria depois de erro de senha. Terceiros seguem barrados.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    /* Empacota os arquivos de /public junto das serverless functions que os
       leem com fs.readFileSync. Sem isto, em producao (Vercel) o arquivo nao
       esta no bundle da function: /public e servido pelo CDN, nao vai junto.

       Sao dois casos com sintomas diferentes:
       - TEMPLATE .docx faltando -> 500 ENOENT, o documento nao sai;
       - BRASAO/ASSINATURA faltando -> nao quebra, as libs devolvem null e o
         documento sai SEM o brasao. Silencioso, e por isso pior de perceber:
         o memorando de ferias, a permuta, o FATD, a portaria e o termo saiam
         em producao sem os brasoes, sem erro nenhum no log. */
    outputFileTracingIncludes: {
      "/api/requerimentos/[id]/gerar": ["./public/templates/**"],
      "/api/joe/[id]/rene": ["./public/templates/**", "./public/brasoes/**"],
      "/api/ferias/memorando-docx": ["./public/brasoes/**"],
      "/api/permutas/docx": ["./public/brasoes/**"],
      "/api/disciplinar/fatd-docx": ["./public/brasoes/**"],
      "/api/disciplinar/portaria-docx": ["./public/brasoes/**"],
      "/api/disciplinar/termo-docx": ["./public/brasoes/**"],
      "/api/escala/docx": ["./public/brasoes/**"],
      "/api/escala/pdf": ["./public/brasoes/**"],
    },
  },
};

module.exports = nextConfig;