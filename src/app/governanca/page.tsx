import Link from "next/link";
import { exigirAdmin } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import BackupBotao from "@/components/BackupBotao";
import AvisoPrivacidadeDoc from "@/components/AvisoPrivacidadeDoc";
import DocumentosLgpd from "@/components/DocumentosLgpd";

export const dynamic = "force-dynamic";

type Status = "ok" | "parcial" | "planejado";
type Item = { titulo: string; status: Status; texto: string };

const ITENS: Item[] = [
  {
    titulo: "Logs de auditoria",
    status: "ok",
    texto: "Registra usuário, data, hora, IP e dispositivo (celular/computador + navegador). Vai ALÉM do básico: guarda o antes/depois das alterações e um lacre por hash (histórico imutável).",
  },
  {
    titulo: "Assinatura eletrônica dos usuários",
    status: "ok",
    texto: "Cada ato é assinado pelo login individual e, nos atos sensíveis (permuta), há reautenticação: a pessoa confirma com a senha no momento de assinar.",
  },
  {
    titulo: "Fluxo de aprovação por níveis (PM → P/1 → Comando)",
    status: "ok",
    texto: "A permuta segue: colega assina o \"concordo\" → parecer do Chefe do P/1 → visto do Subcomandante. Cada nível só é liberado para o titular da função.",
  },
  {
    titulo: "Controle de permissões por função",
    status: "ok",
    texto: "Encargos (Comandante, Subcmt, Chefe/Aux do P/1, P/3, P/4...) definem quem pode fazer o quê. Configurável em Gerenciar Acessos → Encargos/Funções.",
  },
  {
    titulo: "Histórico imutável de alterações",
    status: "ok",
    texto: "Lacre por hash encadeado (tamper-evidence) + âncora externa: o sistema detecta se algum registro foi alterado ou removido.",
  },
  {
    titulo: "Geração automática de PDFs com protocolo e número de controle",
    status: "ok",
    texto: "Peças (disciplinar, permuta, memorandos) saem em PDF/Word. As portarias disciplinares têm numeração automática por tipo/ano e a permuta recebe protocolo (PER-ANO-Nº).",
  },
  {
    titulo: "Backup e trilha de auditoria",
    status: "ok",
    texto: "Trilha de auditoria completa e lacrada (acima). Backup EXTERNO: o admin baixa o backup completo (JSON) quando quiser e há envio automático por e-mail (cópia fora do provedor do banco). Basta configurar o SMTP para o envio semanal automático.",
  },
  {
    titulo: "Proteção de dados pessoais (LGPD)",
    status: "ok",
    texto: "Cada policial só vê os próprios dados; senhas em bcrypt; sessão expira por inatividade (15 min) com relógio visível; cabeçalhos de segurança; CPF e dados bancários criptografados em repouso; e Aviso de Privacidade documental (finalidade, base legal, retenção/descarte, direitos do titular e encarregado/DPO).",
  },
];

const COR: Record<Status, { bg: string; fg: string; rot: string }> = {
  ok: { bg: "#12351f", fg: "#9fe6bd", rot: "Implementado" },
  parcial: { bg: "#3a2f10", fg: "#f3df9d", rot: "Parcial" },
  planejado: { bg: "#22262b", fg: "#9aa6b2", rot: "Planejado" },
};

export default async function GovernancaPage() {
  const session = await exigirAdmin();
  const pushConfigurado = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  return (
    <AppShell userName={session.user.name ?? ""} perfil={session.user.perfil}>
      <div className="mx-auto max-w-4xl text-[#cdd9ea]">
        <h1 className="mb-1 text-2xl font-bold text-white">🛡️ Governança e Conformidade (LGPD)</h1>
        <p className="mb-5 text-sm text-[#94A3B8]">
          Painel de conformidade do SIGEP-18º BPM: rastreabilidade, controle de acesso, assinatura eletrônica e proteção de dados.
        </p>

        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${pushConfigurado ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border-amber-700/50 bg-amber-950/20 text-amber-300"}`}>
          {pushConfigurado
            ? "🔔 Notificações push (celular): CONFIGURADO. Cada usuário precisa ativar as notificações no aparelho para receber."
            : "🔕 Notificações push (celular): NÃO configurado. O sininho na tela funciona; para avisar no celular, defina as chaves VAPID nas variáveis de ambiente."}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {ITENS.map((it) => {
            const c = COR[it.status];
            return (
              <div key={it.titulo} className="rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">{it.titulo}</h2>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: c.bg, color: c.fg }}>{c.rot}</span>
                </div>
                <p className="text-xs leading-relaxed text-[#94A3B8]">{it.texto}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/auditoria" className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110">Abrir a Auditoria (log + lacre)</Link>
          <Link href="/admin/gerar-logins" className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">Encargos / Funções</Link>
          <AvisoPrivacidadeDoc />
        </div>

        <div className="mt-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
          <h2 className="mb-1 text-sm font-bold text-white">📄 Documentos LGPD</h2>
          <p className="mb-3 text-xs text-[#94A3B8]">Além do Aviso de Privacidade: política de retenção/descarte, designação do Encarregado (DPO) e o registro das operações de tratamento (ROPA). Editáveis e imprimíveis — completam a parte documental exigida pela LGPD.</p>
          <DocumentosLgpd />
        </div>

        <div className="mt-4 rounded-xl border border-[#1d2c44] bg-[#0F1B2D] p-4">
          <h2 className="mb-1 text-sm font-bold text-white">💾 Backup externo</h2>
          <p className="mb-3 text-xs text-[#94A3B8]">
            Cópia completa dos dados FORA do provedor do banco. Baixe e guarde no e-mail/Drive, ou configure o envio automático por e-mail.
          </p>
          <BackupBotao />
        </div>

        <p className="mt-5 rounded-lg border border-[#1d2c44] bg-[#0a1626] p-3 text-xs text-[#8fa3bf]">
          Observação técnica: a assinatura é eletrônica por login (autenticação por senha, com reautenticação no ato). Não é assinatura digital certificada (gov.br/ICP-Brasil) — mas a trilha (usuário, IP, dispositivo, hora) é lacrada por hash e ancorável externamente, dando peso probatório à autoria.
        </p>
      </div>
    </AppShell>
  );
}
