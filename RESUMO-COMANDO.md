# SIGEP — 18º BPM
## Resumo executivo

**Sistema Integrado de Gestão de Pessoal — 18º Batalhão de Polícia Militar**

O SIGEP reúne numa **única base** a gestão de pessoal do Batalhão — efetivo, escalas, férias, permutas, promoções e disciplinar. Acessível do quartel ou do celular, **sem servidor para o Batalhão manter e sem custo de licença**. Hoje com **203 militares** cadastrados no plano de férias.

## Os cinco pontos

| | Ponto | O que significa |
|---|---|---|
| **1** | **Uma só fonte de verdade** | Acabou a escala reenviada a cada correção. Publicada, **a última versão sempre prevalece**, e o policial vê na hora, no celular. Todas as anteriores ficam no arquivo. |
| **2** | **Segurança comprovável** | Senhas em **bcrypt** (nem o administrador lê). **CPF e dados bancários cifrados em AES-256-GCM**. HTTPS obrigatório. **5 erros de senha bloqueiam a conta por 15 min**, com registro de IP e aparelho. Sessão cai sozinha por inatividade. |
| **3** | **Documento com valor jurídico** | Assinatura eletrônica **avançada** (MP 2.200-2/2001 e Lei 14.063/2020): o signatário reconfirma a senha e o documento sai com **QR Code**. Qualquer pessoa aponta a câmera e o sistema confirma se é autêntico ou se **foi alterado**. |
| **4** | **Nada se perde** | Trilha de auditoria permanente — **quem fez, o quê, de que IP, como estava antes e como ficou**. Backup completo **enviado por e-mail toda segunda-feira**, fora da plataforma. |
| **5** | **Sem aprisionamento** | O backup é arquivo aberto, com todos os registros. Os dados são **da Corporação** e podem migrar para outra solução a qualquer momento. |

## O que ainda não faz

Dois pontos, ambos acrescentáveis se o Comando julgar necessário:

- **Segundo fator de autenticação (2FA)** — hoje o acesso é login e senha.
- **Servidor intermediário para chamadas (TURN)** — a chamada de vídeo pode falhar entre dois aparelhos em 4G; em Wi-Fi funciona.

Por decisão do próprio Comando, **o chat entre militares não é auditado** — reversível a qualquer momento.

> O SIGEP coloca a gestão de pessoal do 18º BPM em **uma única base, protegida por criptografia, com trilha de auditoria e documentos eletronicamente assináveis e verificáveis por QR Code** — sem custo de licença e sem servidor para o Batalhão manter.

*18º Batalhão de Polícia Militar · Presidente Dutra — MA · O detalhamento técnico completo está no Dossiê do Comando.*
