import { readFileSync } from "node:fs";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function carregarEnv() {
  try {
    const txt = readFileSync(".env", "utf-8");
    for (const linha of txt.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    console.error("Nao consegui ler o .env");
  }
}
carregarEnv();

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function main() {
  console.log("Conta:", accountId);
  console.log("Bucket:", bucket);
  console.log("");
  const chave = "teste/conexao.txt";

  console.log("1) Enviando arquivo de teste...");
  await r2.send(new PutObjectCommand({
    Bucket: bucket, Key: chave,
    Body: "SIGEP - teste de conexao R2 ok",
    ContentType: "text/plain",
  }));
  console.log("   enviado.");

  console.log("2) Listando o bucket...");
  const lista = await r2.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
  console.log("   objetos encontrados:", lista.KeyCount ?? 0);

  console.log("3) Apagando o arquivo de teste...");
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
  console.log("   apagado.");

  console.log("");
  console.log("TUDO CERTO! O R2 esta ligado e funcionando.");
}

main().catch((e) => {
  console.error("");
  console.error("FALHOU. Detalhe do erro:");
  console.error(e.name + ":", e.message);
  process.exit(1);
});