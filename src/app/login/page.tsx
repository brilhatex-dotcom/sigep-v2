"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Lock,
  User,
  Eye,
  EyeOff,
  ChevronRight,
  Monitor,
  FileText,
  Users,
  BarChart3,
  History,
  ShieldCheck,
  Calendar,
  AlertCircle,
  Radio,
} from "lucide-react";

// Particle system
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: {
      x: number; y: number; vx: number; vy: number;
      r: number; alpha: number; color: string;
    }[] = [];

    const colors = ["#D4AF37", "#1a3a6b", "#2a5298", "#D4AF3755"];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(212, 175, 55, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.7 }}
    />
  );
}

// Scanning line effect
function ScanLine() {
  return (
    <motion.div
      className="pointer-events-none fixed left-0 right-0 z-10 h-px"
      style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent)" }}
      animate={{ top: ["0%", "100%"] }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />
  );
}

const systemFeatures = [
  { icon: Calendar, label: "Escalas e Serviços" },
  { icon: FileText, label: "Boletins e Ocorrências" },
  { icon: AlertCircle, label: "Audiências" },
  { icon: Users, label: "Efetivo" },
  { icon: BarChart3, label: "Relatórios Gerenciais" },
  { icon: History, label: "Histórico e Movimentações" },
  { icon: ShieldCheck, label: "Segurança e Auditoria" },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setPulseActive((p) => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020b18] font-sans">
      {/* Background layers */}
      <ParticleCanvas />
      <ScanLine />

      {/* Deep background gradient */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#020b18] via-[#061428] to-[#020b18]" />
        <div className="absolute left-0 top-0 h-[600px] w-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#0a2a5e] opacity-20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#D4AF3722] blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0d1f3c] opacity-30 blur-[150px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top header bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-20 border-b border-[#D4AF3722] bg-[#020b18cc] px-6 py-3 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full transition-colors duration-1000 ${pulseActive ? "bg-[#D4AF37]" : "bg-[#D4AF3766]"}`} />
              <span className="text-xs font-medium tracking-[0.2em] text-[#D4AF37]">SISTEMA OPERACIONAL</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-[0.3em] text-[#8ba4c4]">
              ★ POLÍCIA MILITAR DO MARANHÃO ★
            </p>
            <h1 className="text-sm font-black tracking-[0.25em] text-white">
              18º BATALHÃO DE POLÍCIA MILITAR
            </h1>
            <p className="text-[10px] tracking-[0.4em] text-[#D4AF37]">— SERVIR E PROTEGER —</p>
          </div>
          <div className="flex items-center gap-2">
            <Radio className="h-3 w-3 text-[#D4AF37]" />
            <span className="text-xs tracking-[0.15em] text-[#8ba4c4]">CENTRO DE OPERAÇÕES</span>
            <span className="ml-2 rounded border border-[#D4AF3744] px-2 py-0.5 text-[10px] font-bold text-[#D4AF37]">18º BPM</span>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="relative z-10 flex min-h-[calc(100vh-120px)] items-center px-4 py-8">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-6 lg:grid-cols-3">

          {/* LEFT PANEL — System features */}
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            {/* Car light glow simulation */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full bg-blue-900 opacity-10 blur-[80px]" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-60 w-60 rounded-full bg-red-900 opacity-10 blur-[60px]" />

            <div
              className="rounded-2xl border border-[#D4AF3722] p-6"
              style={{
                background: "linear-gradient(135deg, rgba(2,11,24,0.9) 0%, rgba(6,20,40,0.85) 100%)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 0 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,175,55,0.1)",
              }}
            >
              <div className="mb-5 flex items-center gap-2 border-b border-[#D4AF3720] pb-4">
                <Monitor className="h-4 w-4 text-[#D4AF37]" />
                <span className="text-xs font-bold tracking-[0.2em] text-[#D4AF37]">SISTEMA INTEGRADO</span>
              </div>

              <div className="space-y-1">
                {systemFeatures.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    className="group flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-[#D4AF3710]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#D4AF3730] bg-[#D4AF3710] transition-colors group-hover:border-[#D4AF3760] group-hover:bg-[#D4AF3720]">
                      <f.icon className="h-3.5 w-3.5 text-[#D4AF37]" />
                    </div>
                    <span className="text-sm text-[#8ba4c4] transition-colors group-hover:text-white">
                      {f.label}
                    </span>
                    <ChevronRight className="ml-auto h-3 w-3 text-[#D4AF3740] opacity-0 transition-opacity group-hover:opacity-100" />
                  </motion.div>
                ))}
              </div>

              {/* Status indicator */}
              <div className="mt-5 flex items-center gap-2 border-t border-[#D4AF3720] pt-4">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                <span className="text-[10px] tracking-[0.15em] text-[#4a6a8a]">SISTEMA ATIVO</span>
                <span className="ml-auto text-[10px] text-[#D4AF3760]">v2.0</span>
              </div>
            </div>
          </motion.div>

          {/* CENTER PANEL — Login form */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="flex flex-col items-center"
          >
            {/* Crest / Badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.3, type: "spring" }}
              className="relative mb-6"
            >
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-full bg-[#D4AF37] opacity-10 blur-xl" />
              <div
                className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#D4AF37]"
                style={{
                  background: "radial-gradient(circle, #0d2040 0%, #020b18 70%)",
                  boxShadow: "0 0 30px rgba(212,175,55,0.3), 0 0 60px rgba(212,175,55,0.1), inset 0 0 20px rgba(212,175,55,0.05)",
                }}
              >
                <Shield className="h-10 w-10 text-[#D4AF37]" strokeWidth={1.5} />
              </div>
              {/* Corner stars */}
              {[0, 90, 180, 270].map((deg) => (
                <div
                  key={deg}
                  className="absolute h-1.5 w-1.5 rounded-full bg-[#D4AF37]"
                  style={{
                    top: "50%",
                    left: "50%",
                    transform: `rotate(${deg}deg) translateY(-54px) translateX(-3px)`,
                  }}
                />
              ))}
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-1 text-center"
            >
              <h2 className="text-2xl font-black tracking-[0.15em] text-white">
                SIGEP-<span className="text-[#D4AF37]">18BPM</span>
              </h2>
              <p className="text-xs text-[#8ba4c4]">Sistema Integrado de Gestão de Efetivo Policial</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#D4AF3744] px-3 py-1">
                <div className="h-1 w-1 rounded-full bg-[#D4AF37]" />
                <span className="text-[10px] font-medium tracking-[0.15em] text-[#D4AF37]">18º BPM • PRESIDENTE DUTRA - MA</span>
              </div>
            </motion.div>

            {/* Login card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-6 w-full max-w-sm"
              style={{
                background: "linear-gradient(145deg, rgba(6,20,40,0.95) 0%, rgba(2,11,24,0.98) 100%)",
                backdropFilter: "blur(30px)",
                border: "1px solid rgba(212,175,55,0.2)",
                borderRadius: "20px",
                boxShadow: "0 25px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 1px 0 rgba(212,175,55,0.1) inset",
              }}
            >
              <div className="p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#D4AF37]" />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#D4AF37]">ACESSO AO SISTEMA</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Login field */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] tracking-[0.15em] text-[#5a7a9a]">LOGIN</label>
                    <div className="group relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6a8a] transition-colors group-focus-within:text-[#D4AF37]" />
                      <input
                        type="text"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        placeholder="Digite seu usuário"
                        className="w-full rounded-xl border border-[#1a3a5e] bg-[#040e1a] py-3 pl-10 pr-4 text-sm text-white placeholder-[#2a4a6a] outline-none transition-all focus:border-[#D4AF3766] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] tracking-[0.15em] text-[#5a7a9a]">SENHA</label>
                    <div className="group relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6a8a] transition-colors group-focus-within:text-[#D4AF37]" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite sua senha"
                        className="w-full rounded-xl border border-[#1a3a5e] bg-[#040e1a] py-3 pl-10 pr-11 text-sm text-white placeholder-[#2a4a6a] outline-none transition-all focus:border-[#D4AF3766] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.08)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a6a8a] transition-colors hover:text-[#D4AF37]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit button */}
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="relative mt-2 w-full overflow-hidden rounded-xl py-3 text-sm font-bold tracking-[0.2em] text-[#020b18] transition-all"
                    style={{
                      background: loading
                        ? "linear-gradient(135deg, #a08a25, #c4a030)"
                        : "linear-gradient(135deg, #D4AF37, #f0c842, #D4AF37)",
                      boxShadow: "0 4px 20px rgba(212,175,55,0.4)",
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-2"
                        >
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#020b18] border-t-transparent" />
                          AUTENTICANDO...
                        </motion.div>
                      ) : (
                        <motion.div
                          key="text"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-2"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          ENTRAR
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </form>

                {/* First access hint */}
                <div
                  className="mt-4 rounded-xl border border-[#D4AF3720] p-3"
                  style={{ background: "rgba(212,175,55,0.04)" }}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-[#D4AF37]" />
                    <span className="text-[10px] font-bold tracking-[0.15em] text-[#D4AF37]">PRIMEIRO ACESSO?</span>
                  </div>
                  <p className="text-[11px] text-[#5a7a9a]">
                    Login: <span className="font-mono text-[#8ba4c4]">admin</span>
                    {" "}|{" "}
                    Senha: <span className="font-mono text-[#8ba4c4]">admin@2026</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#3a5a7a]">Altere a senha após o primeiro login.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* RIGHT PANEL — Quote & ops monitors */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#0a2a5e] opacity-10 blur-[80px]" />

            <div
              className="rounded-2xl border border-[#D4AF3722] p-6"
              style={{
                background: "linear-gradient(135deg, rgba(6,20,40,0.9) 0%, rgba(2,11,24,0.85) 100%)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 0 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,175,55,0.1)",
              }}
            >
              {/* Simulated monitor grid */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                    className="relative overflow-hidden rounded-lg border border-[#1a3a5e] bg-[#040e1a]"
                    style={{ paddingTop: "62%" }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="space-y-1 px-2">
                        {[...Array(4)].map((_, j) => (
                          <motion.div
                            key={j}
                            className="h-0.5 rounded-full bg-[#1a3a5e]"
                            animate={{ width: ["30%", "80%", "50%", "70%"] }}
                            transition={{
                              duration: 3 + j,
                              repeat: Infinity,
                              delay: i * 0.5 + j * 0.3,
                            }}
                          />
                        ))}
                      </div>
                      <Monitor className="absolute h-5 w-5 text-[#1a3a5e]" />
                    </div>
                    <div className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500 opacity-60" />
                  </motion.div>
                ))}
              </div>

              {/* Quote block */}
              <div className="border-t border-[#D4AF3720] pt-4">
                <div className="mb-3 flex items-start gap-2">
                  <span className="text-3xl leading-none text-[#D4AF37] opacity-60">"</span>
                  <blockquote className="text-sm italic leading-relaxed text-[#8ba4c4]">
                    A missão da Polícia Militar é servir e proteger a sociedade,
                    garantindo a ordem pública com honra, disciplina e responsabilidade.
                  </blockquote>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-[#D4AF3730]" />
                  <Shield className="h-3 w-3 text-[#D4AF3760]" />
                  <div className="h-px flex-1 bg-[#D4AF3730]" />
                </div>
              </div>

              {/* Status bar */}
              <div className="mt-4 space-y-2">
                {[
                  { label: "Efetivo Ativo", value: "217", color: "#4ade80" },
                  { label: "Escalas Hoje", value: "12", color: "#D4AF37" },
                  { label: "Sistema", value: "Online", color: "#60a5fa" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-[#4a6a8a]">{s.label}</span>
                    <span className="text-xs font-bold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="relative z-10 border-t border-[#D4AF3715] bg-[#020b18cc] px-6 py-3 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#D4AF3760]" />
            <span className="text-[10px] tracking-[0.15em] text-[#3a5a7a]">PMMA</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#3a5a7a]">
              Polícia Militar do Maranhão — 18º BPM • Presidente Dutra - MA
            </p>
            <p className="text-[10px] text-[#2a4a6a]">
              Sistema Integrado de Gestão de Efetivo Policial
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.1em] text-[#3a5a7a]">
              &lt;/&gt; SD ELVYS DANILO
            </span>
            <div className="flex items-center gap-1 rounded border border-[#D4AF3730] px-2 py-0.5">
              <Shield className="h-3 w-3 text-[#D4AF37]" />
              <span className="text-[10px] font-bold text-[#D4AF37]">18º BPM</span>
            </div>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
