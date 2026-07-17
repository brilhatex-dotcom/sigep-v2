import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gerarBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/* GET /api/backup/email -> envia o backup por e-mail (cópia externa automática).
   Autoriza de duas formas:
     - Admin logado (botão "enviar agora" na Governança), ou
     - Vercel Cron / chamada agendada com  Authorization: Bearer <CRON_SECRET>.
   Só funciona se o SMTP estiver configurado nas variáveis de ambiente:
     EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS  (e opcional EMAIL_TO).
   Para Gmail: host smtp.gmail.com, porta 465, senha = "senha de app" (App Password).
   Sem SMTP, responde { configurado:false } sem quebrar (igual ao push/VAPID). */

function smtpConfigurado(): boolean {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

async function autorizado(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  const session = await getServerSession(authOptions);
  const perfil = ((session?.user as any)?.perfil || "").toLowerCase();
  return !!session?.user && (perfil === "admin" || perfil === "gestor");
}

export async function GET(req: Request) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  if (!smtpConfigurado()) {
    return NextResponse.json({
      ok: false,
      configurado: false,
      aviso:
        "SMTP não configurado. Defina EMAIL_HOST, EMAIL_PORT, EMAIL_USER e EMAIL_PASS (senha de app do Gmail) nas variáveis de ambiente.",
    });
  }
  try {
    const dump = await gerarBackup();
    const total = Object.values(dump.contagem).reduce((a, b) => a + b, 0);
    const dataStr = dump.geradoEm.slice(0, 10);
    const conteudo = Buffer.from(JSON.stringify(dump, null, 2), "utf-8");

    // import dinâmico para não pesar o bundle quando o backup não é usado
    const nodemailer = (await import("nodemailer")).default;
    const porta = Number(process.env.EMAIL_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: porta,
      secure: porta === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const para = process.env.EMAIL_TO || process.env.EMAIL_USER!;
    await transporter.sendMail({
      from: `"SIGEP-18º BPM" <${process.env.EMAIL_USER}>`,
      to: para,
      subject: `Backup SIGEP-18º BPM — ${dataStr}`,
      text: `Backup automático do SIGEP-18º BPM gerado em ${dump.geradoEm}.\n${total} registros no total.\nGuarde este arquivo em local seguro (cópia externa ao provedor do banco).`,
      attachments: [
        { filename: `sigep-18bpm-backup-${dataStr}.json`, content: conteudo, contentType: "application/json" },
      ],
    });

    return NextResponse.json({ ok: true, enviadoPara: para, registros: total });
  } catch (err) {
    console.error("[GET /api/backup/email]", err);
    return NextResponse.json({ error: "Falha ao enviar o backup por e-mail" }, { status: 500 });
  }
}
