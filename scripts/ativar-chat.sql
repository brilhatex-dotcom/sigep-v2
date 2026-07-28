-- =========================================================================
--  ATIVAR O CHAT DO SIGEP
--
--  Cria as duas tabelas que o chat usa. É seguro rodar mais de uma vez:
--  se já existir, ele não faz nada (por causa do IF NOT EXISTS).
--
--  COMO USAR (não precisa saber programar):
--    1. Entre em  https://neon.tech  com a sua conta
--    2. Abra o projeto do SIGEP
--    3. No menu da esquerda, clique em  "SQL Editor"
--    4. Cole TODO este arquivo na caixa e clique em  "Run"
--    5. Deve aparecer "Success". Pronto — recarregue o SIGEP.
-- =========================================================================

-- Guarda cada mensagem trocada.
CREATE TABLE IF NOT EXISTS "chat_mensagens" (
    "id"       TEXT NOT NULL,
    "De"       TEXT NOT NULL,
    "Para"     TEXT NOT NULL,
    "Texto"    TEXT,
    "ArqKey"   TEXT,
    "ArqNome"  TEXT,
    "ArqTipo"  TEXT,
    "ArqTam"   INTEGER,
    "CriadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "LidaEm"   TIMESTAMP(3),
    CONSTRAINT "chat_mensagens_pkey" PRIMARY KEY ("id")
);

-- Guarda quem apareceu por último (para mostrar a bolinha verde de "online").
CREATE TABLE IF NOT EXISTS "chat_presenca" (
    "Login" TEXT NOT NULL,
    "Visto" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_presenca_pkey" PRIMARY KEY ("Login")
);

-- Deixam a busca das conversas rápida mesmo com muita mensagem.
CREATE INDEX IF NOT EXISTS "chat_mensagens_De_Para_CriadoEm_idx"
    ON "chat_mensagens" ("De", "Para", "CriadoEm");

CREATE INDEX IF NOT EXISTS "chat_mensagens_Para_LidaEm_idx"
    ON "chat_mensagens" ("Para", "LidaEm");
