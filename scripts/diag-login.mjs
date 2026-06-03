import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

function carregarEnv() {
  try {
    const t = readFileSync(".env", "utf-8");
    for (const l of t.split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}
carregarEnv();

const prisma = new PrismaClient();

function hashSenha(senha, salt) {
  return crypto.createHash("sha256").update(salt + senha + salt).digest("hex");
}

async function main() {
  const login = "admin";
  const senhaTeste = "981201";

  const u = await prisma.usuario.findUnique({ where: { login } });
  if (!u) {
    console.log("RESULTADO: nao existe usuario com login =", login);
    const todos = await prisma.usuario.findMany({ take: 5 });
    console.log("Exemplos de logins no banco:", todos.map((x) => x.login));
    return;
  }

  console.log("Usuario encontrado:");
  console.log("  login:", JSON.stringify(u.login));
  console.log("  ativo:", JSON.stringify(u.ativo));
  console.log("  perfil:", JSON.stringify(u.perfil));
  console.log("  tem salt?", !!u.salt, "| tem senhaHash?", !!u.senhaHash);

  if (u.salt && u.senhaHash) {
    const calc = hashSenha(senhaTeste, u.salt);
    console.log("  senha '981201' confere?", calc === u.senhaHash ? "SIM" : "NAO");
  }
}

main()
  .catch((e) => console.error("ERRO:", e.message))
  .finally(() => prisma.$disconnect());