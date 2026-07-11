// scripts/resetar-senhas.mjs
// Reseta senhas em massa preservando contas críticas.
// Uso:
//   node scripts/resetar-senhas.mjs            -> dry run (mostra o que faria)
//   node scripts/resetar-senhas.mjs --executar -> EXECUTA de verdade

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const LOGINS_PRESERVADOS = ['2561991', 'admin'];
const SENHA_PADRAO = '123456';
const DRY_RUN = !process.argv.includes('--executar');

function gerarSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// IDENTICO ao lib/auth.ts: sha256(salt + senha + salt) hex
function hashSenha(senha, salt) {
  return crypto.createHash('sha256').update(salt + senha + salt, 'utf8').digest('hex');
}

async function main() {
  console.log('========================================');
  console.log('  RESET DE SENHAS - SIGEP-18BPM');
  console.log('========================================');
  console.log(`Modo:         ${DRY_RUN ? '🟡 DRY RUN' : '🔴 EXECUCAO REAL'}`);
  console.log(`Senha padrao: ${SENHA_PADRAO}`);
  console.log(`Preservados:  ${LOGINS_PRESERVADOS.join(', ')}`);
  console.log('');

  // 1) Verifica preservados
  const preservados = await prisma.usuario.findMany({
    where: { login: { in: LOGINS_PRESERVADOS } },
    select: { login: true, nomeCompleto: true, perfil: true, ativo: true },
  });

  console.log(`Preservados encontrados (${preservados.length}/${LOGINS_PRESERVADOS.length}):`);
  preservados.forEach(p =>
    console.log(`  ✓ ${p.login.padEnd(10)} ${p.nomeCompleto ?? '(sem nome)'} [${p.perfil}] ativo=${p.ativo}`)
  );

  if (preservados.length !== LOGINS_PRESERVADOS.length) {
    const faltando = LOGINS_PRESERVADOS.filter(l => !preservados.find(p => p.login === l));
    console.error(`\n❌ ABORTADO: preservados nao encontrados: ${faltando.join(', ')}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2) Alvos do reset
  const alvos = await prisma.usuario.findMany({
    where: {
      ativo: 'SIM',
      login: { notIn: LOGINS_PRESERVADOS },
    },
    select: { id: true, login: true, nomeCompleto: true },
    orderBy: { login: 'asc' },
  });

  console.log(`\nUsuarios a resetar: ${alvos.length}`);

  if (DRY_RUN) {
    console.log('\n--- Amostra (primeiros 10) ---');
    alvos.slice(0, 10).forEach(u =>
      console.log(`  ${u.login.padEnd(10)} ${u.nomeCompleto ?? ''}`)
    );
    console.log(`  ... e mais ${Math.max(0, alvos.length - 10)} usuarios.`);
    console.log('\n🟡 DRY RUN concluido. Nada foi alterado.');
    console.log('   Para executar de verdade: node scripts/resetar-senhas.mjs --executar');
    await prisma.$disconnect();
    return;
  }

  // 3) Confirmacao temporal
  console.log('\n🔴 Iniciando reset em 5 segundos... (Ctrl+C para abortar)');
  await new Promise(r => setTimeout(r, 5000));

  let ok = 0;
  let erro = 0;
  const erros = [];

  for (const u of alvos) {
    try {
      const salt = gerarSalt();
      const hash = hashSenha(SENHA_PADRAO, salt);
      await prisma.usuario.update({
        where: { id: u.id },
        data: {
          senhaHash: hash,
          salt,
          precisaTrocar: true,
          tentativas: 0,
          bloqueadoAte: null,
        },
      });
      ok++;
      if (ok % 25 === 0) console.log(`  progresso: ${ok}/${alvos.length}`);
    } catch (e) {
      erro++;
      erros.push({ login: u.login, msg: e.message });
    }
  }

  // 4) Auditoria
  try {
    await prisma.auditoria.create({
      data: {
        acao: 'reset_senhas_massa',
        autorLogin: 'SCRIPT',
        autorNome: 'resetar-senhas.mjs',
        detalhe: `Reset em massa: ${ok} ok, ${erro} erros. Preservados: ${LOGINS_PRESERVADOS.join(', ')}.`,
      },
    });
  } catch (e) {
    console.error(`\n⚠️  Falha ao gravar auditoria: ${e.message}`);
  }

  console.log('\n========================================');
  console.log(`✅ Concluido: ${ok} resetados, ${erro} erros.`);
  if (erros.length) {
    console.log('Detalhe dos erros:');
    erros.forEach(e => console.log(`  - ${e.login}: ${e.msg}`));
  }
  console.log('========================================');

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});