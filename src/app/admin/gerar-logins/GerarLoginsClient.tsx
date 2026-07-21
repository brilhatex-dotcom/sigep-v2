"use client";

import { useEffect, useState } from "react";
import EncargosManager from "@/components/EncargosManager";

type Previa = { totalEfetivo: number; aCorrigir: number; aCriar: number; semMatricula: number; adminsPreservados: number; preservados?: number };
type Resultado = { ok: boolean; corrigidos: number; criados: number; semMatricula: number; adminsPreservados: number; preservados?: number; erros?: string[] };
type Militar = {
  efetivoId: string; postoGrad: string | null; numeroBarra: string | null;
  nome: string | null; nomeGuerra: string | null; matricula: string | null;
  temLogin: boolean; idSimples: string;
};
type AdminAtual = { efetivoId: string | null; login: string; nome: string; matricula: string };
type AdminBusca = { efetivoId: string; nome: string; matricula: string; jaAdmin: boolean; temLogin: boolean };

function nomeMil(m: Militar): string {
  const posto = (m.postoGrad || "").trim();
  const guerra = (m.nomeGuerra || m.nome || "").trim();
  const cap = guerra ? guerra.charAt(0).toUpperCase() + guerra.slice(1).toLowerCase() : "";
  return [posto, cap].filter(Boolean).join(" ") || (m.nome || "Militar");
}

export default function GerarLoginsClient() {
  // ---- padronizacao em massa ----
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // ---- reset individual ----
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Militar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [resetando, setResetando] = useState<string | null>(null);
  const [msgReset, setMsgReset] = useState<string | null>(null);

  // ---- gerenciar admins ----
  const [admins, setAdmins] = useState<AdminAtual[]>([]);
  const [buscaAdm, setBuscaAdm] = useState("");
  const [listaAdm, setListaAdm] = useState<AdminBusca[]>([]);
  const [buscandoAdm, setBuscandoAdm] = useState(false);
  const [mexendoAdm, setMexendoAdm] = useState<string | null>(null);
  const [msgAdm, setMsgAdm] = useState<string | null>(null);

  const carregarPrevia = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/gerar-logins");
      if (!r.ok) throw new Error("HTTP " + r.status);
      setPrevia(await r.json());
    } catch (e) {
      setErro("Falha ao carregar a previa (" + String(e) + ").");
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregarPrevia(); }, []);

  // carrega admins atuais
  const carregarAdmins = async (busca?: string) => {
    setBuscandoAdm(true);
    setMsgAdm(null);
    try {
      const url = "/api/admin/gerenciar-admins" + (busca ? "?busca=" + encodeURIComponent(busca) : "");
      const r = await fetch(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgAdm(d.error || "Falha ao carregar admins."); return; }
      setAdmins(d.admins || []);
      if (busca !== undefined) setListaAdm(d.resultados || []);
    } finally {
      setBuscandoAdm(false);
    }
  };
  useEffect(() => { carregarAdmins(); }, []);

  const mudarPerfil = async (efetivoId: string, acao: "promover" | "rebaixar", nome: string) => {
    const verbo = acao === "promover" ? "tornar ADMIN" : "remover o admin de";
    if (!confirm(`Confirma ${verbo} ${nome}?`)) return;
    setMexendoAdm(efetivoId);
    setMsgAdm(null);
    try {
      const r = await fetch("/api/admin/gerenciar-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId, acao }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgAdm(d.error || "Falha ao alterar."); return; }
      setMsgAdm(acao === "promover" ? `${nome} agora e administrador.` : `${nome} voltou a ser policial.`);
      carregarAdmins(buscaAdm || undefined);
    } finally {
      setMexendoAdm(null);
    }
  };

  const aplicar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/gerar-logins", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao aplicar."); return; }
      setResultado(d);
      setConfirmando(false);
      carregarPrevia();
    } finally {
      setGerando(false);
    }
  };

  const buscar = async () => {
    setBuscando(true);
    setMsgReset(null);
    try {
      const r = await fetch("/api/admin/resetar-senha?busca=" + encodeURIComponent(busca));
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgReset(d.error || "Falha na busca."); return; }
      setLista(d.resultados || []);
    } finally {
      setBuscando(false);
    }
  };

  const resetar = async (m: Militar) => {
    if (!confirm(`Resetar a senha de ${nomeMil(m)} para 12345678? Ele tera que criar uma senha nova (e assinar o termo LGPD) no proximo acesso.`)) return;
    setResetando(m.efetivoId);
    setMsgReset(null);
    try {
      const r = await fetch("/api/admin/resetar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efetivoId: m.efetivoId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgReset(d.error || "Falha ao resetar."); return; }
      setMsgReset(`Senha de ${nomeMil(m)} resetada para 12345678. Avise para ele entrar com o ID ${m.idSimples} e a senha 12345678.`);
    } finally {
      setResetando(null);
    }
  };

  const totalAcao = previa ? previa.aCorrigir + previa.aCriar : 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", color: "#E8EEF6", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Acessos dos policiais</h1>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 18 }}>
        Padronize os logins em massa ou resete a senha de um policial individualmente.
      </p>

      {/* ===== BLOCO 1: padronizacao ===== */}
      <div style={{ background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#D4AF37", marginBottom: 4 }}>Padronizar logins (login = ID · senha 12345678)</div>
        <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 12px" }}>
          Cada policial passa a logar pelo <b>ID</b> com a senha inicial <b>12345678</b> e, no primeiro acesso,
          é obrigado a criar uma senha nova e assinar o termo LGPD. A conta do Ten Silas e as contas de
          administrador mantêm a senha atual e não são alteradas.
        </p>

        {erro && <div style={box("#3a1414", "#7a1f1f", "#ffb3b3")}>{erro}</div>}
        {carregando && <div style={box("#16243a", "#2b3f63", "#9fb0c7")}>Carregando previa...</div>}

        {previa && !carregando && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
            <Num v={previa.totalEfetivo} l="militares no efetivo" />
            <Num v={previa.aCorrigir} l="logins a corrigir" destaque />
            <Num v={previa.aCriar} l="logins a criar" destaque />
            <Num v={previa.preservados ?? 0} l="preservados (Silas + admins)" />
          </div>
        )}

        {resultado && (
          <div style={box("#10301f", "#2e6b48", "#bff0d0")}>
            Pronto! {resultado.corrigidos} corrigido(s), {resultado.criados} criado(s).
          </div>
        )}

        {previa && totalAcao > 0 && !resultado && (
          confirmando ? (
            <div style={{ background: "#2a2410", border: "1px solid #6b5320", borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 13, color: "#f3df9d", margin: "0 0 10px" }}>
                Confirmar padronizacao de <b>{totalAcao}</b> logins? Login vira o ID, senha vira <b>12345678</b> e exige troca + termo LGPD no proximo acesso.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn("#D4AF37", "#0a1020")} disabled={gerando} onClick={aplicar}>
                  {gerando ? "Aplicando..." : "Sim, aplicar"}
                </button>
                <button style={btn("#16243a", "#E8EEF6", "#2b3f63")} disabled={gerando} onClick={() => setConfirmando(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button style={btn("#D4AF37", "#0a1020")} onClick={() => setConfirmando(true)}>Padronizar {totalAcao} logins</button>
          )
        )}
        {previa && totalAcao === 0 && !resultado && (
          <div style={box("#16243a", "#2b3f63", "#9fb0c7")}>Tudo ja padronizado.</div>
        )}
      </div>

      {/* ===== BLOCO 2: reset individual ===== */}
      <div style={{ background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#D4AF37", marginBottom: 4 }}>Resetar senha de um policial</div>
        <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 12px" }}>
          Quando alguem esquecer a senha. A senha volta a ser 12345678 e ele cria uma nova (e assina o termo LGPD) no proximo acesso.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
            placeholder="Nome, nome de guerra, matricula ou ID..."
            style={{ flex: 1, background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}
          />
          <button style={btn("#16243a", "#E8EEF6", "#2b3f63")} disabled={buscando} onClick={buscar}>
            {buscando ? "..." : "Buscar"}
          </button>
        </div>

        {msgReset && <div style={box("#10301f", "#2e6b48", "#bff0d0")}>{msgReset}</div>}

        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lista.map((m) => (
              <div key={m.efetivoId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#0a1626", border: "1px solid #1d2c44", borderRadius: 8, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#E8EEF6" }}>{nomeMil(m)}</div>
                  <div style={{ fontSize: 11, color: "#6f82a0" }}>
                    Mat: {soDig(m.matricula)} · ID: {m.idSimples} {m.temLogin ? "" : "· (sem login)"}
                  </div>
                </div>
                <button
                  style={btn(m.temLogin ? "#D4AF37" : "#16243a", m.temLogin ? "#0a1020" : "#6f82a0", m.temLogin ? "#D4AF37" : "#2b3f63")}
                  disabled={!m.temLogin || resetando === m.efetivoId}
                  onClick={() => resetar(m)}
                >
                  {resetando === m.efetivoId ? "..." : "Resetar senha"}
                </button>
              </div>
            ))}
          </div>
        )}
        {lista.length === 0 && busca !== "" && !buscando && (
          <div style={box("#16243a", "#2b3f63", "#9fb0c7")}>Nenhum militar encontrado para a busca.</div>
        )}
      </div>

      {/* ===== Encargos / Funções ===== */}
      <EncargosManager />

      {/* ===== BLOCO 3: gerenciar admins ===== */}
      <div style={{ background: "#0F1B2D", border: "1px solid #1d2c44", borderRadius: 12, padding: 18, marginTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#D4AF37", marginBottom: 4 }}>Administradores do sistema</div>
        <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 12px" }}>
          Quem tem acesso total. Promova ou rebaixe pelo nome/matricula. Todas as mudancas ficam registradas na auditoria.
        </p>

        {msgAdm && <div style={box("#10301f", "#2e6b48", "#bff0d0")}>{msgAdm}</div>}

        {/* admins atuais */}
        <div style={{ fontSize: 12, color: "#9fb0c7", marginBottom: 6 }}>Admins atuais ({admins.length})</div>
        {admins.length === 0 ? (
          <div style={box("#16243a", "#2b3f63", "#9fb0c7")}>Nenhum admin encontrado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {admins.map((a) => (
              <div key={a.login} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#0a1626", border: "1px solid #1d2c44", borderRadius: 8, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#E8EEF6" }}>{a.nome}</div>
                  <div style={{ fontSize: 11, color: "#6f82a0" }}>Login: {a.matricula}</div>
                </div>
                {a.efetivoId ? (
                  <button
                    style={btn("#3a1414", "#ffb3b3", "#7a1f1f")}
                    disabled={mexendoAdm === a.efetivoId}
                    onClick={() => mudarPerfil(a.efetivoId as string, "rebaixar", a.nome)}
                  >
                    {mexendoAdm === a.efetivoId ? "..." : "Remover admin"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "#6f82a0" }}>conta de sistema</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* buscar para promover */}
        <div style={{ fontSize: 12, color: "#9fb0c7", marginBottom: 6 }}>Adicionar novo admin</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={buscaAdm}
            onChange={(e) => setBuscaAdm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") carregarAdmins(buscaAdm); }}
            placeholder="Nome, nome de guerra, matricula ou ID..."
            style={{ flex: 1, background: "#0a1626", color: "#E8EEF6", border: "1px solid #28395a", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}
          />
          <button style={btn("#16243a", "#E8EEF6", "#2b3f63")} disabled={buscandoAdm} onClick={() => carregarAdmins(buscaAdm)}>
            {buscandoAdm ? "..." : "Buscar"}
          </button>
        </div>

        {listaAdm.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {listaAdm.map((m) => (
              <div key={m.efetivoId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#0a1626", border: "1px solid #1d2c44", borderRadius: 8, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#E8EEF6" }}>{m.nome}</div>
                  <div style={{ fontSize: 11, color: "#6f82a0" }}>
                    Mat: {m.matricula} {m.jaAdmin ? "· ja e admin" : m.temLogin ? "" : "· (sem login)"}
                  </div>
                </div>
                {m.jaAdmin ? (
                  <span style={{ fontSize: 12, color: "#9fe6bd" }}>✓ admin</span>
                ) : (
                  <button
                    style={btn(m.temLogin ? "#D4AF37" : "#16243a", m.temLogin ? "#0a1020" : "#6f82a0", m.temLogin ? "#D4AF37" : "#2b3f63")}
                    disabled={!m.temLogin || mexendoAdm === m.efetivoId}
                    onClick={() => mudarPerfil(m.efetivoId, "promover", m.nome)}
                  >
                    {mexendoAdm === m.efetivoId ? "..." : "Tornar admin"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {listaAdm.length === 0 && buscaAdm !== "" && !buscandoAdm && (
          <div style={box("#16243a", "#2b3f63", "#9fb0c7")}>Nenhum militar encontrado.</div>
        )}
      </div>

      <p style={{ fontSize: 12, color: "#6f82a0", marginTop: 18, lineHeight: 1.5 }}>
        Instrucao para a tropa: &quot;Seu login e o seu ID e a senha inicial e 12345678. No primeiro acesso o sistema pede para criar uma senha nova (minimo 8 caracteres, misturando letras com numeros ou simbolos) e assinar o termo LGPD.&quot;
      </p>
    </div>
  );
}

function soDig(v: string | null): string { return String(v || "").replace(/\D/g, ""); }

function Num({ v, l, destaque, alerta }: { v: number; l: string; destaque?: boolean; alerta?: boolean }) {
  const cor = alerta ? "#f3df9d" : destaque ? "#D4AF37" : "#E8EEF6";
  return (
    <div style={{ background: "#0a1626", border: "1px solid #1d2c44", borderRadius: 9, padding: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{v}</div>
      <div style={{ fontSize: 11, color: "#6f82a0", marginTop: 2 }}>{l}</div>
    </div>
  );
}

function box(bg: string, bd: string, fg: string): React.CSSProperties {
  return { background: bg, border: "1px solid " + bd, color: fg, borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 14 };
}
function btn(bg: string, fg: string, bd?: string): React.CSSProperties {
  return { background: bg, color: fg, border: "1px solid " + (bd || bg), borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
}
