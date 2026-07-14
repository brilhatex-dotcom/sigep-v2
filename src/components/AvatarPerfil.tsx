"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { X, Upload, Trash2, Move, Loader2, Check, ImagePlus } from "lucide-react";

type Ajuste = { zoom: number; x: number; y: number };
const PADRAO: Ajuste = { zoom: 1, x: 0, y: 0 };

// Redimensiona preservando o aspecto (lado maior = 512), para haver margem de
// reposicionamento dentro do circulo. Devolve JPEG.
async function redimensionar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const MAX = 512;
  const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponivel");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("falha"))), "image/jpeg", 0.85)
  );
}

function Circulo({ src, ajuste, size, inicial }: { src: string | null; ajuste: Ajuste; size: number; inicial: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "9999px", overflow: "hidden", position: "relative", background: "rgba(212,175,55,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={inicial} draggable={false} style={{
          position: "absolute", left: "50%", top: "50%", width: "100%", height: "100%", objectFit: "cover",
          transform: `translate(-50%, -50%) translate(${ajuste.x}%, ${ajuste.y}%) scale(${ajuste.zoom})`,
        }} />
      ) : (
        <span style={{ color: "#D4AF37", fontWeight: 700, fontSize: Math.round(size * 0.4) }}>{inicial}</span>
      )}
    </div>
  );
}

export default function AvatarPerfil({
  efetivoId, inicial, temFoto, podeEditar, tamanho = 44,
}: {
  efetivoId: string | null; inicial: string; temFoto: boolean; podeEditar: boolean; tamanho?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [versao, setVersao] = useState(0);
  const [tem, setTem] = useState(temFoto);
  const [ajuste, setAjuste] = useState<Ajuste>(PADRAO);
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"ver" | "posicionar">("ver");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const src = efetivoId && tem ? `/api/foto/${encodeURIComponent(efetivoId)}?v=${versao}` : null;

  useEffect(() => {
    if (!efetivoId) return;
    fetch(`/api/foto/ajuste?efetivoId=${encodeURIComponent(efetivoId)}`)
      .then((r) => r.json()).then((d) => { if (d?.ajuste) setAjuste(d.ajuste); }).catch(() => {});
  }, [efetivoId]);

  async function aoSelecionar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !efetivoId) return;
    setErro(null); setOcupado("upload");
    try {
      const blob = await redimensionar(file);
      const fd = new FormData();
      fd.append("foto", blob, "foto.jpg");
      fd.append("efetivoId", efetivoId);
      const r = await fetch("/api/foto", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Falha ao enviar."); return; }
      setTem(true); setVersao((v) => v + 1);
      setAjuste(PADRAO);
      await fetch("/api/foto/ajuste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efetivoId, ...PADRAO }) }).catch(() => {});
    } catch { setErro("Não foi possível processar a imagem."); }
    finally { setOcupado(null); }
  }

  async function excluir() {
    if (!efetivoId || !confirm("Excluir a foto de perfil?")) return;
    setOcupado("excluir"); setErro(null);
    try {
      const r = await fetch("/api/foto", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efetivoId }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.error || "Falha ao excluir."); return; }
      setTem(false); setModo("ver");
    } catch { setErro("Erro de conexão."); }
    finally { setOcupado(null); }
  }

  async function salvarPosicao() {
    if (!efetivoId) return;
    setOcupado("posicao");
    try {
      await fetch("/api/foto/ajuste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efetivoId, ...ajuste }) });
      setModo("ver");
    } catch { setErro("Erro ao salvar a posição."); }
    finally { setOcupado(null); }
  }

  // arrastar dentro do circulo (modo posicionar)
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  function onDown(e: ReactPointerEvent) {
    if (modo !== "posicionar") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    arrastando.current = { x: e.clientX, y: e.clientY };
  }
  function onMove(e: ReactPointerEvent) {
    if (modo !== "posicionar" || !arrastando.current) return;
    const dx = e.clientX - arrastando.current.x;
    const dy = e.clientY - arrastando.current.y;
    arrastando.current = { x: e.clientX, y: e.clientY };
    setAjuste((a) => ({
      ...a,
      x: Math.min(100, Math.max(-100, a.x + (dx / 240) * 100)),
      y: Math.min(100, Math.max(-100, a.y + (dy / 240) * 100)),
    }));
  }
  function onUp() { arrastando.current = null; }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAberto(true); setModo("ver"); }}
        title="Ver/editar foto de perfil"
        style={{ width: tamanho, height: tamanho, borderRadius: "9999px", border: "2px solid rgba(212,175,55,0.35)", padding: 0, cursor: "pointer", background: "transparent" }}
      >
        <Circulo src={src} ajuste={ajuste} size={tamanho} inicial={inicial} />
      </button>

      {podeEditar && (
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={aoSelecionar} style={{ display: "none" }} />
      )}

      {aberto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1B2D] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-white">Foto de perfil</h3>
              <button onClick={() => setAberto(false)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                style={{ touchAction: "none", cursor: modo === "posicionar" ? "grab" : "default" }}
                className={modo === "posicionar" ? "ring-2 ring-[#D4AF37] rounded-full" : ""}
              >
                <Circulo src={src} ajuste={ajuste} size={240} inicial={inicial} />
              </div>

              {modo === "posicionar" ? (
                <div className="w-full space-y-3">
                  <p className="text-center text-xs text-[#94A3B8]">Arraste a foto no círculo e ajuste o zoom.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#94A3B8]">Zoom</span>
                    <input type="range" min={1} max={4} step={0.05} value={ajuste.zoom}
                      onChange={(e) => setAjuste((a) => ({ ...a, zoom: Number(e.target.value) }))}
                      className="flex-1 accent-[#D4AF37]" />
                  </div>
                  <div className="flex justify-between gap-2">
                    <button onClick={() => setAjuste(PADRAO)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#94A3B8] hover:bg-white/5 hover:text-white">Centralizar</button>
                    <div className="flex gap-2">
                      <button onClick={() => setModo("ver")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#94A3B8] hover:bg-white/5 hover:text-white">Cancelar</button>
                      <button onClick={salvarPosicao} disabled={ocupado === "posicao"}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                        {ocupado === "posicao" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar posição
                      </button>
                    </div>
                  </div>
                </div>
              ) : podeEditar ? (
                <div className="grid w-full grid-cols-2 gap-2">
                  <button onClick={() => inputRef.current?.click()} disabled={ocupado === "upload"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-2 text-sm font-semibold text-[#1a1205] hover:brightness-110 disabled:opacity-60">
                    {ocupado === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : (tem ? <Upload className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />)}
                    {tem ? "Trocar foto" : "Adicionar foto"}
                  </button>
                  <button onClick={() => setModo("posicionar")} disabled={!tem}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-40">
                    <Move className="h-4 w-4" /> Reposicionar
                  </button>
                  <button onClick={excluir} disabled={!tem || ocupado === "excluir"}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-2 text-sm text-red-300 hover:bg-red-950/50 disabled:opacity-40">
                    {ocupado === "excluir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir foto
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#94A3B8]">Sua conta não está vinculada a uma ficha.</p>
              )}

              {erro && <p className="w-full rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">{erro}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
