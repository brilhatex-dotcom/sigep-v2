/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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