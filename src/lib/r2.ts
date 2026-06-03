import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 fala o "idioma" S3, entao usamos o SDK da AWS
// apontando para o endpoint do R2.
const accountId = process.env.R2_ACCOUNT_ID ?? "";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export const R2_BUCKET = process.env.R2_BUCKET ?? "sigep-documentos";

/** Envia bytes para o R2 e devolve a chave (caminho) do objeto. */
export async function enviarParaR2(
  key: string,
  corpo: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: corpo,
      ContentType: contentType,
    })
  );
  return key;
}

/** Baixa um objeto do R2 como Buffer (usado para unir os PDFs). */
export async function baixarDoR2(key: string): Promise<Buffer> {
  const res = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/** Gera URL temporaria (assinada) para baixar um objeto privado. */
export async function urlAssinada(key: string, segundos = 600): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: segundos }
  );
}

/** Remove um objeto do R2. */
export async function removerDoR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
