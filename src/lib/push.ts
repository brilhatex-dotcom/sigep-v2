import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Configura as chaves VAPID uma vez (no carregamento do modulo).
const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:18batalhaopmma@gmail.com";

let configurado = false;
function garantirConfig() {
  if (configurado) return;
  if (PUBLIC && PRIVATE) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configurado = true;
  }
}

export type Notificacao = {
  title: string;
  body: string;
  url?: string;   // pra onde ir ao clicar
  tag?: string;   // agrupa notificacoes do mesmo tipo
};

/* Envia uma notificacao para TODAS as inscricoes de um login.
   Remove automaticamente inscricoes mortas (410/404). */
export async function enviarParaLogin(login: string, n: Notificacao) {
  garantirConfig();
  if (!configurado) {
    console.error("[push] VAPID nao configurado (faltam env vars).");
    return { enviadas: 0, removidas: 0 };
  }

  const inscricoes = await prisma.pushSubscription.findMany({ where: { login } });
  const payload = JSON.stringify(n);
  let enviadas = 0;
  let removidas = 0;

  for (const s of inscricoes) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload
      );
      enviadas++;
    } catch (err: any) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        // inscricao expirou/cancelou: remove
        try {
          await prisma.pushSubscription.delete({ where: { id: s.id } });
          removidas++;
        } catch {}
      } else {
        console.error("[push] falha ao enviar:", code, err?.body || err?.message);
      }
    }
  }

  return { enviadas, removidas };
}

/* Envia para varios logins de uma vez (util para avisos em massa). */
export async function enviarParaVarios(logins: string[], n: Notificacao) {
  let enviadas = 0;
  let removidas = 0;
  for (const login of logins) {
    const r = await enviarParaLogin(login, n);
    enviadas += r.enviadas;
    removidas += r.removidas;
  }
  return { enviadas, removidas };
}