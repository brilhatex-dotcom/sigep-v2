# Manual do SIGEP — 18º BPM

Guia prático de uso do sistema. Escrito para duas pessoas diferentes:

- **O policial** (usuário comum) — consulta a escala, as férias e os documentos dele.
- **O administrador** (P/1, Cmt, Subcmt e o escalante) — cadastra, monta a escala e publica.

Se você é policial, leia a **Parte 1**. Se é administrador, leia a **Parte 1 e a Parte 2**.

---

## Sumário

- [Antes de começar](#antes-de-começar)
- [Parte 1 — Área do policial](#parte-1--área-do-policial)
- [Parte 2 — Área do administrador](#parte-2--área-do-administrador)
  - [Recursos Humanos](#recursos-humanos)
  - [Escalas de serviço](#escalas-de-serviço)
  - [Férias e Licença-Prêmio](#férias-e-licença-prêmio)
  - [Operacional](#operacional-joe-permutas-requerimentos-cursos)
  - [Disciplinar](#disciplinar)
  - [Centro de Comando](#centro-de-comando)
  - [Administração e Governança](#administração-e-governança)
- [Parte 3 — Receitas do dia a dia](#parte-3--receitas-do-dia-a-dia)
- [Parte 4 — Problemas comuns](#parte-4--problemas-comuns)

---

## Antes de começar

### Entrar no sistema

1. Abra o endereço do SIGEP no navegador (celular ou computador).
2. Informe **login** e **senha** entregues pelo P/1.
3. Na primeira entrada o sistema pede para **trocar a senha**. Escolha uma senha só sua.

> Esqueceu a senha? Só o P/1 (admin) reemite, em **Administração → Gerenciar Acessos**.

### Os dois perfis

| | Policial | Administrador |
|---|---|---|
| Vê a escala publicada | ✅ | ✅ |
| Vê as **próprias** férias e a equipe dele | ✅ | ✅ |
| Vê a ficha dele, cursos, certidões | ✅ | ✅ |
| Pede permuta e requerimento | ✅ | ✅ |
| **Monta e publica** a escala | ❌ | ✅ |
| Cadastra efetivo, férias, disciplinar | ❌ | ✅ |

O menu muda sozinho conforme o seu perfil — você só enxerga o que pode usar.

---

# Parte 1 — Área do policial

O que aparece no seu menu:

### Escala de Serviço

Mostra as escalas **publicadas** pelo P/1 — é o quadro oficial.

- Você vê a escala da **sua unidade**: quem é lotado na **sede** (Permanência, Força Tática, Rádio Patrulha, Inteligência, Administrativa, Ronda Escolar, Maria da Penha e demais funções do quartel) vê a **escala da sede**; quem é de CIA/Pelotão destacado vê a da sua unidade.
- A escala aparece **assim que o administrador clica em “📢 Publicar”**. Antes disso ela não existe para você.
- Ficam guardadas também as **escalas passadas**, agrupadas por mês — é o arquivo/histórico.
- Dá para baixar cada uma em **📄 PDF** ou **📝 Word**.

**Escala republicada.** Às vezes o P/1 publica a escala do mesmo dia mais de uma vez (correção de erro, informação nova). Vale sempre a **última publicada** daquele dia — ela aparece marcada como **vigente**. As anteriores ficam guardadas como **substituída**, escondidas atrás de *“ver versões anteriores”*. Se ficou em dúvida, **a que vale é a de cima, marcada vigente**.

### Meu Mapa de Escala

Previsão dos **seus próximos serviços**: em que dias você entra e em qual função (CPU, FT, RP, Permanência, Inteligência, ROTEM). Serve para se programar. É previsão do rodízio — a palavra final é a escala publicada.

### Minhas Férias

- **Suas férias**: os períodos do plano por equipe e as férias avulsas (datas soltas), com data de início, fim e apresentação.
- **Plano de férias da minha equipe**: a equipe em que você está no plano, os períodos dela e **os colegas que saem junto com você**. Você aparece destacado com *(você)*. Quem adiou as férias aparece marcado como **adiado** — esse militar não sai de férias e segue no serviço normal.

### Ficha Individual

Seus dados funcionais. Confira e avise o P/1 se algo estiver errado.

### Promoções / Certidões

Suas certidões e a situação nos períodos de promoção.

### Permutas

Pedido de troca de serviço. Você solicita, e o P/1 autoriza ou nega. Enquanto não é autorizada, a permuta fica pendente.

### Requerimentos

Requerimentos ao Comando. Preencha, envie e acompanhe o andamento.

### Cursos

Cursos que você tem registrados.

### Verificar Documento

Confere se um documento emitido pelo SIGEP é autêntico — pelo **QR Code** ou pelo código do documento.

---

# Parte 2 — Área do administrador

## Recursos Humanos

### Cadastro de Efetivo

O coração do sistema — **todo o resto puxa daqui**.

- **Adicionar policial**: preencha posto/graduação, nome, nome de guerra, nº/barra, matrícula, lotação e quadro.
- **Lotação** é o campo mais importante depois do nome: é ela que define **qual escala o policial enxerga** e em qual unidade ele entra nos relatórios.
- **Editar / inativar**: mantenha atualizado. Militar movimentado ou inativo precisa ser ajustado aqui, senão continua aparecendo nas listas e na escala.

### Hierarquia, Antiguidade e Organograma

- **Hierarquia** — a estrutura de postos e graduações.
- **Efetivo por Antiguidade** — a tropa ordenada por antiguidade (usada para ordenar nomes nos documentos).
- **Organograma** — a árvore da unidade: sede (ADM, Especializado/FT, ROTEM) e CIAs/Pelotões destacados.
- **Efetivo por Lotação** — quem está em cada lugar.

### Ficha Individual e Promoções

Consulta da ficha de qualquer militar e gestão dos períodos de promoção e certidões.

---

## Escalas de serviço

Esta é a parte mais usada. Ela tem **duas telas que conversam entre si**:

> **Mapa de Escala** = onde você define **quem é de cada equipe** (a fonte).
> **Escalas de Serviço** = a **folha do dia**, que já vem preenchida pelo Mapa e é o que se imprime e publica.

### Mapa de Escala — o quadro por equipes

É aqui que a escala nasce.

- **Quadro A/B/C/D**: cada coluna é uma equipe e cada linha é uma função (FT Graduado, FT Motorista, FT Patrulheiro, RP Adjunto, RP Motorista, RP Patrulheiro, Permanência, Inteligência). Em cima de cada letra aparece o dia de serviço daquela equipe.
- **Adicionar militar numa vaga**: clique em **“+ adicionar”** na célula e busque o nome.
- **Mover**: arraste a pessoa de uma célula para outra (troca de função ou de equipe).
- **Mais de um na mesma função**: use **“+ linha”** para criar um 2º/3º patrulheiro, por exemplo.
- **Ciclo**: sem padrão definido é **24/72** (4 equipes A/B/C/D). Dá para configurar outro padrão (ex.: “3 por 6”) para unidades com escala diferente.
- **Aplicar aos dias futuros**: ao mexer no quadro o sistema **já reaplica sozinho** aos dias futuros já salvos. O botão **“🔄 Aplicar o quadro aos dias futuros”** é só para forçar quando você quiser.

> ⚠️ **Atenção ao colocar um policial novo.** A mudança vale **na hora**, mas ele entra na **equipe** onde você o colocou — então o primeiro serviço dele é **no próximo dia daquela equipe** (no 24/72 isso pode levar 2 a 3 dias). Se precisar que ele entre **já no próximo serviço**, coloque-o **direto no dia**, pela folha (Escalas de Serviço → busque o militar na função). Isso funciona em **todas as funções, inclusive Força Tática**.

**Afastamentos.** No mesmo Mapa há o quadro **Afastamentos**: registre férias, missão, curso, ROTAM, licença etc. com data de saída e retorno. O motor **pula o militar afastado em todas as funções e em todas as telas**, e a vaga fica em branco para você cobrir. Férias lançadas no **Plano de Férias** e em **Licença-Prêmio** entram automaticamente aqui — não precisa lançar de novo.

**Redução judicial de escala.** Quadro próprio, logo abaixo dos afastamentos. Para o militar que, por **determinação judicial**, só pode trabalhar parte do mês:

1. Busque o militar e informe o **percentual máximo do mês** (ex.: `50`).
2. O motor passa a **distribuir automaticamente** os serviços dele até esse teto e o pula nos demais dias.
3. Você **ainda pode escalá-lo manualmente** além do teto: ao colocá-lo numa função, o sistema avisa *“tem redução judicial de X%, escalar mesmo assim?”* — é só confirmar.

Para remover a restrição, clique no **×** na linha dele.

### Escalas de Serviço — a folha do dia

- **Escolha a data** no topo. Se o dia ainda não existe, o sistema **gera sozinho** pelo rodízio e herda o expediente do último dia salvo.
- **Tipo de escala**: Normal, Feriado, Ponto facultativo, **Extraordinária** ou **Escala da JOE (RENE)**.
- **Editar qualquer campo**: clique e digite. Tudo é editável — o motor só dá o ponto de partida.
- **Acrescentar militar numa função**: use o **“🔎 buscar militar”** dentro da função, ou **“+ linha em branco”**. Vale para Permanência, Inteligência, Rádio Patrulha e **Força Tática** (inclusive Patrulheiro).
- **Permuta**: no militar escalado, clique em **“+ permuta”** e informe quem vai cobrir.
- **Observação**: campo livre no rodapé — só aparece e imprime se você preencher.
- **Escala extraordinária**: preencha Operação, **Cmt da Operação**, Local, Horário, Uniforme e a lista de reforço.

**Sair com o documento:**

| Botão | O que faz |
|---|---|
| 🖨 **Imprimir** | Imprime direto |
| 📄 **PDF** | Baixa em PDF |
| 📝 **Word** | Baixa em Word (para editar fora) |
| 📢 **Publicar** | **Libera a escala para a tropa** |

> **Publicar é o que conta.** Enquanto você não clicar em **📢 Publicar**, o policial **não vê** a escala. Depois de publicar, ela aparece na hora em “Escala de Serviço” do policial.

**Republicar o mesmo dia.** Se precisar corrigir depois de publicado, corrija e **publique de novo**. O sistema cria uma nova versão (v2, v3…) e **a última passa a valer**, tanto para você quanto para os policiais. As anteriores ficam no arquivo marcadas como *substituída* — nada se perde.

### Demais telas de escala

- **Publicações** — o arquivo de tudo que já foi publicado, por mês, com download em PDF/Word. É o histórico oficial.
- **CPU Semanal** — a escala semanal do oficial de CPU, com o visto do Cmt.
- **Encargos e Comando** — quem é Cmt e Sargenteante de cada lugar. Define quem assina e quem publica em cada unidade.
- **Estatísticas da Escala** — quantos serviços cada militar fez no período. Serve para equilibrar a carga.
- **Escalas das Unidades** — acesso às escalas das CIAs/Pelotões destacados.
- **Permutas** — todas as trocas pedidas, para **autorizar** ou **negar**.

### Como funciona a escala das unidades destacadas

- Cada CIA/Pelotão tem a **sua própria escala**, separada da sede.
- O **Sargenteante** monta e envia; a publicação fica **pendente** até o **Cmt** local autorizar.
- Sem sargenteante, o próprio **Cmt** publica já autorizada.
- O **admin do BPM** enxerga e opera todas.

---

## Férias e Licença-Prêmio

### Plano de Férias

- Escolha o **ano de gozo** no alto.
- As **equipes** (com 1º e 2º período) aparecem em cartões. Clique numa equipe para ver os militares.
- **Editar datas** da equipe: início, fim e apresentação de cada período.
- **Novo plano**: cria o plano do ano seguinte copiando os militares do ano atual — depois é só ajustar as datas.
- **Permuta de equipe**: move um militar de uma equipe para outra.
- **Memorando**: gera o memorando de concessão de férias do militar; dá para **assinar em lote** (Chefe P/1 ou Cmt).
- **Imprimir**: relatório do plano inteiro.

> A **lista nominal de quem está de férias hoje** não fica aqui — ela está no **Dashboard**, no cartão *Efetivo em férias*, com os nomes de cada equipe e também os de férias avulsas.

**Adiar férias.** Para o militar que **não vai gozar as férias agora**:

1. Abra a equipe dele.
2. Na linha do militar, clique em **“Adiar”** (fica ao lado de *Memorando* e *Editar*).
3. Confirme, informe o **exercício** (o ano das férias que ele fica devendo — já vem preenchido com o ano do plano aberto) e o motivo, se quiser.

Ele passa a exibir a etiqueta **Adiado** na lista e no relatório impresso.

**O que o “Adiado” faz:** o militar **não sai de férias**. Ele deixa de aparecer como ausente **em todas as telas** — escala de serviço, organograma, efetivo, lotação, antiguidade, dashboard e o painel “de férias hoje” — e **continua no serviço normal**, mesmo que a equipe dele esteja no período de férias.

Para desfazer, clique de novo no botão: ele volta a sair de férias no período da equipe.

### Relatório de férias vencidas / a gozar

No alto da página do **Plano de Férias**, logo abaixo dos números, fica o painel **“Férias vencidas / a gozar”**. Ele lista todos os militares que **adiaram** as férias, mostrando:

| Coluna | O que é |
|---|---|
| **Militar** | Posto/graduação e nome |
| **Exercício** | O **ano** das férias que ele tem a gozar |
| **Situação** | **VENCIDA** (vermelho) se o exercício já passou; **A GOZAR** (âmbar) se ainda é do ano corrente |
| **Observação** | O motivo informado no adiamento |

No topo do painel aparece o total de **vencidas**, e o botão **🖨 Imprimir relatório** gera a folha para levar ao Comando.

> A conta é simples: exercício **anterior ao ano atual** = **vencida**. Exercício do **ano corrente** = ainda dá para gozar dentro do ano.

> O botão **Adiar** só aparece para o **administrador**, dentro da equipe (clique no cartão da equipe primeiro). O policial vê a marca dele em “Minhas Férias”.

**Férias avulsas.** No fim da mesma página: férias em datas soltas, fora do plano por equipes. Informe militar, início, fim e observação. Também removem o militar da escala no período.

### Licença-Prêmio

Mesma lógica do plano de férias, com equipes e um período (90 dias). Gera memorando e também afasta o militar da escala automaticamente.

---

## Operacional (JOE, Permutas, Requerimentos, Cursos)

- **JOE — Jornada Operacional Extraordinária**: cadastre a JOE, inscreva/valide candidatos e aprove. A escala da JOE pode ser montada direto na folha (tipo *Escala da JOE (RENE)*), puxando os aprovados.
- **Permutas de Serviço**: fila de pedidos. Autorize ou negue. A permuta autorizada entra na folha do dia.
- **Requerimentos**: requerimentos da tropa, com andamento e despacho.
- **Cursos**: cursos por militar.
- **Verificar Documento**: confere a autenticidade de documentos emitidos (QR Code / código).

---

## Disciplinar

Módulos de **FATD**, **Sindicância**, **IPS** e **IPM**. Em cada um você instaura o procedimento, designa o encarregado, define objeto e prazo, e o sistema gera a **Portaria** e os termos, prontos para imprimir/assinar. Acesso restrito ao admin.

---

## Centro de Comando

**Controle de Entrada e Saída** — registro de movimentação, para o controle do quartel.

---

## Administração e Governança

### Gerenciar Acessos (Acessos dos policiais)

- **Gerar login** para um militar do efetivo.
- **Resetar senha** de quem esqueceu (o militar troca no próximo acesso).
- **Definir perfil**: `admin` (acesso total) ou `policial` (restrito).

> Regra de ouro: dê perfil **admin** só a quem realmente monta escala e cadastra. Todo o resto é **policial**.

### Governança e LGPD

Documentos de conformidade: aviso de privacidade, política de retenção e descarte, base legal do tratamento dos dados.

### Auditoria

Registro do que foi feito no sistema e por quem. Use quando precisar apurar uma alteração.

### Tentativas de Acesso

Tentativas de login que falharam — para acompanhar segurança.

---

# Parte 3 — Receitas do dia a dia

### Fazer e publicar a escala do dia

1. **Escalas de Serviço** → escolha a data.
2. Confira o que o motor preencheu (FT, RP, Permanência, Inteligência, ROTEM, CPU).
3. Ajuste o que precisar: troque nomes, adicione militares na função, lance permutas, escreva a observação.
4. **📢 Publicar**.
5. Pronto — a tropa já vê em “Escala de Serviço”.

### Corrigir uma escala já publicada

1. Abra a mesma data, corrija o que estiver errado.
2. **📢 Publicar** de novo.
3. A nova versão passa a **vigorar** automaticamente para todos. A anterior fica no arquivo como *substituída*.

### Colocar um policial novo na escala

- **Para valer já no próximo serviço:** abra a folha do dia e busque o militar direto na função.
- **Para valer daqui em diante (permanente):** coloque-o na equipe certa no **Mapa de Escala**. Ele entra no próximo dia de serviço **da equipe dele**.
- Na prática, quando o policial chega no meio do ciclo, faça **os dois**.

### Tirar da escala quem entrou de férias

Normalmente **não precisa fazer nada**: férias do Plano, Licença-Prêmio e férias avulsas removem o militar automaticamente, inclusive dos dias já salvos e do expediente.

Se for uma ausência que não está no plano (missão, curso, ROTAM, licença), registre em **Mapa de Escala → Afastamentos** com as datas.

### Registrar quem vai adiar as férias

**Plano de Férias** → clique na equipe → **Adiar** na linha do militar. Ele fica marcado como **Adiado** e **não sai de férias**: continua na escala e em todas as telas, mesmo com a equipe dele de férias.

### Cadastrar uma redução judicial

**Mapa de Escala** → quadro **Redução judicial de escala** → busque o militar → informe o **% do mês** (ex.: 50). O motor limita sozinho. Para escalar além do teto, é só confirmar o aviso.

### Acrescentar um 2º patrulheiro na Força Tática

- **Só naquele dia:** na folha, na linha PATRULHEIRO da Força Tática, use **“🔎 buscar militar”** ou **“+ linha em branco”**.
- **Fixo, todo ciclo:** no **Mapa de Escala**, use **“+ linha”** na função *FT Patrulheiro* e preencha a vaga em cada equipe.

---

# Parte 4 — Problemas comuns

**“O policial diz que não vê a escala.”**
Verifique, nesta ordem: (1) a escala daquele dia foi **publicada** (📢 Publicar)? (2) se é unidade destacada, a publicação foi **autorizada pelo Cmt** local? (3) a **lotação** do militar está preenchida corretamente no Cadastro de Efetivo?

**“Publiquei duas vezes o mesmo dia. Qual vale?”**
A **última**. Ela aparece marcada como **vigente**, para você e para a tropa. As anteriores ficam como *substituída*.

**“Coloquei o policial no quadro e ele não apareceu na escala de hoje.”**
Ele entrou na **equipe** que você escolheu e só entra no **próximo dia daquela equipe**. Para hoje/amanhã, coloque-o direto na folha do dia.

**“Militar de férias continua aparecendo.”**
Confirme se as férias estão lançadas no **Plano de Férias**, em **Licença-Prêmio** ou em **férias avulsas**, e se as **datas** estão certas. Estando lançado, ele sai sozinho da escala e do expediente. Se for outro motivo, registre em **Afastamentos**.

**“Não acho o botão Adiar.”**
Ele fica **dentro da equipe**: Plano de Férias → clique no cartão da equipe → na linha do militar, ao lado de *Memorando* e *Editar*. Só aparece para **admin**.

**“Marquei como Adiado mas o militar continua ausente.”**
Depois de marcar, ele volta ao serviço na hora. Se ainda aparecer ausente, verifique se ele não tem também uma **férias avulsa** ou uma **Licença-Prêmio** lançada no mesmo período — essas são independentes do plano e precisam ser removidas à parte.

**“Esqueci minha senha.”**
Procure o P/1: **Administração → Gerenciar Acessos → Resetar senha**.

**“O nome saiu errado no documento.”**
Corrija no **Cadastro de Efetivo** — todos os documentos puxam de lá. Depois gere o documento de novo.

---

## Em resumo

- **Cadastro de Efetivo** é a base de tudo — mantenha a **lotação** correta.
- **Mapa de Escala** define as equipes; **Escalas de Serviço** é a folha do dia.
- **Nada existe para a tropa antes do 📢 Publicar.**
- **Republicou? A última vale.**
- Férias e afastamentos **removem sozinhos** da escala; **Adiar** faz o contrário: devolve o militar ao serviço.
