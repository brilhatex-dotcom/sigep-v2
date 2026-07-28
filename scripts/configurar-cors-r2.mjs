/* =========================================================================
   Libera o CORS do bucket R2 para o chat.

   Por que isso é necessário: no chat, o arquivo vai do NAVEGADOR direto
   para o Cloudflare R2 (a Vercel corta requisições acima de ~4,5 MB, então
   não dá para o anexo passar pela API). Para o navegador poder fazer esse
   PUT, o bucket precisa autorizar a origem do sistema.

   Sem isso: mensagem de texto funciona, anexo falha.

   Como usar (uma única vez, na sua máquina, com o .env preenchido):

     node scripts/configurar-cors-r2.mjs https://seu-sistema.vercel.app

   Pode passar mais de uma origem (produção, domínio próprio, localhost):

     node scripts/configurar-cors-r2.mjs https://sigep.com.br http://localhost:3000
   ========================================================================= */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";

// carrega o .env sem depender de pacote extra
for (const arquivo of [".env.local", ".env"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const conta = process.env.R2_ACCOUNT_ID;
const chave = process.env.R2_ACCESS_KEY_ID;
const segredo = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || "sigep-documentos";

if (!conta || !chave || !segredo) {
  console.error("\n❌ Faltam credenciais do R2 no .env:");
  console.error("   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY\n");
  process.exit(1);
}

const origens = process.argv.slice(2).filter(Boolean);
if (origens.length === 0) {
  console.error("\n❌ Informe a(s) origem(ns) do sistema. Exemplo:");
  console.error("   node scripts/configurar-cors-r2.mjs https://seu-sistema.vercel.app\n");
  process.exit(1);
}
for (const o of origens) {
  if (!/^https?:\/\//.test(o)) {
    console.error(`\n❌ Origem inválida: "${o}" — precisa começar com http:// ou https://\n`);
    process.exit(1);
  }
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${conta}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: chave, secretAccessKey: segredo },
});

const regras = [
  {
    AllowedOrigins: origens,
    AllowedMethods: ["PUT", "GET", "HEAD"],
    AllowedHeaders: ["content-type"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

try {
  console.log(`\nBucket:  ${bucket}`);
  console.log(`Origens: ${origens.join(", ")}\n`);

  await r2.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: regras },
  }));

  const atual = await r2.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log("✅ CORS aplicado. Configuração atual no bucket:\n");
  console.log(JSON.stringify(atual.CORSRules, null, 2));
  console.log("\nO envio de anexos do chat já deve funcionar.\n");
} catch (err) {
  console.error("\n❌ Não foi possível aplicar o CORS:");
  console.error("   " + (err?.message || err));
  console.error("\nConfira se as credenciais do R2 têm permissão de administração do bucket.");
  console.error("Se não tiverem, dá para fazer pelo painel: Cloudflare → R2 → " + bucket + " → Settings → CORS Policy.\n");
  process.exit(1);
}
