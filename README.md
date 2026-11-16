# Checklist Estrutural das Lojas

Formulário de vistoria estrutural para os supervisores de loja e painel de resultados para a equipe de Facilities.

| Página | Quem usa | Acesso |
|---|---|---|
| `index.html` | Supervisores (link enviado por WhatsApp) | Público, sem login |
| `admin.html` | Administradores (Luiz, William) | E-mail e senha |

- **Hospedagem:** GitHub Pages (gratuito)
- **Banco de dados e fotos:** Supabase (plano gratuito atende)

---

## Passo 1: Criar o projeto no Supabase

1. Acesse **https://supabase.com**, crie uma conta e clique em **New project**.
2. Dê o nome `checklist-lojas`, crie uma senha do banco (guarde-a) e escolha a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto (1 a 2 minutos).

## Passo 2: Criar as tabelas, as regras de segurança e a pasta de fotos

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer "Success".

O script faz o seguinte:
- cria a tabela de **lojas**, já com as 59 lojas;
- cria a tabela de **checklists** (as respostas);
- cria a tabela de **administradores**, já com os e-mails do Luiz e do William;
- cria o bucket privado de **fotos**;
- aplica as regras de segurança: o supervisor só consegue **enviar**; ler, alterar e apagar são permitidos apenas aos administradores.

## Passo 3: Criar os logins dos administradores

1. Abra **Authentication → Users → Add user → Create new user**.
2. Informe o e-mail `luiz.ferreira@portalnova.com.br`, uma senha e marque **Auto Confirm User**.
3. Repita para `william.rocha@portalnova.com.br`.
4. Abra **Authentication → Sign In / Providers** (ou **Settings**) e **desative "Allow new users to sign up"**. Assim ninguém consegue criar conta por conta própria.

> Só entra no painel quem tem login **e** está na tabela `admins`. Para incluir outro administrador, crie o usuário (item 2) e adicione o e-mail em **Table Editor → admins**.

Se esquecer a senha, use **"Esqueci minha senha"** na tela de login. Para o link do e-mail funcionar, configure em **Authentication → URL Configuration**:
- em **Site URL**, o endereço do painel, por exemplo `https://SEU-USUARIO.github.io/checklist-lojas/admin.html`;
- em **Redirect URLs**, esse mesmo endereço.

## Passo 4: Ligar o site ao Supabase

1. Abra **Project Settings → API** (ou **API Keys**).
2. Copie a **Project URL** e a chave pública, que pode aparecer como **anon public** ou **publishable**.
3. Abra o arquivo `config.js` deste projeto e substitua os dois valores:

```js
SUPABASE_URL: "https://abcdefghijk.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

> A chave pública pode ficar no site, porque as regras de segurança do Passo 2 é que protegem os dados. **Nunca** use a chave `service_role` / `secret` no `config.js`.

## Passo 5: Publicar no GitHub Pages

1. Crie uma conta em **https://github.com** (se ainda não tiver).
2. Clique em **New repository**, use o nome `checklist-lojas` e escolha **Public** (o plano gratuito do Pages exige repositório público). Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**, arraste **todo o conteúdo** desta pasta (arquivos e pastas) e clique em **Commit changes**.
4. Abra **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**; em **Branch**, escolha `main` e a pasta `/ (root)`. Clique em **Save**.
5. Em 1 a 2 minutos, os links ficam disponíveis:
   - **Supervisores:** `https://SEU-USUARIO.github.io/checklist-lojas/`
   - **Painel:** `https://SEU-USUARIO.github.io/checklist-lojas/admin.html`

> O repositório público mostra o código, mas não os dados. As respostas e as fotos ficam no Supabase, protegidas.

## Passo 6: Testar antes de enviar

1. Abra o link dos supervisores no celular, preencha uma loja de teste e envie.
2. Abra o painel, entre com seu login e confira se a loja aparece em "Concluídas".
3. Para apagar o teste, abra o Supabase em **Table Editor → checklists**, selecione a linha e clique em **Delete**.

---

## Opcional: e-mail de confirmação a cada checklist

Envia um e-mail para Luiz e William com a loja, o supervisor, a nota e a lista de problemas, sempre que chegar um checklist novo. Usa o serviço **Resend** (gratuito até 3.000 e-mails por mês).

1. Crie uma conta em **https://resend.com**.
2. Em **Domains**, adicione `portalnova.com.br` e peça à TI para cadastrar no DNS os registros que o Resend mostrar.
   > Sem domínio verificado, o Resend só envia para o e-mail da própria conta.
3. Em **API Keys**, crie uma chave.
4. No Supabase, abra **Edge Functions → Deploy a new function → Via Editor** e use o nome `notificar-checklist`. Cole o conteúdo de `supabase/functions/notificar-checklist/index.ts`, **desative "Verify JWT"** e clique em **Deploy**.
5. Em **Edge Functions → Secrets**, cadastre:

| Nome | Valor |
|---|---|
| `RESEND_API_KEY` | a chave do Resend |
| `EMAIL_REMETENTE` | `Checklist Lojas <checklist@portalnova.com.br>` |
| `EMAIL_DESTINO` | `luiz.ferreira@portalnova.com.br,william.rocha@portalnova.com.br` |
| `PAINEL_URL` | o link do painel |
| `WEBHOOK_SECRET` | um texto aleatório longo (ex.: gere uma senha de 30 caracteres) |

6. Abra **Database → Webhooks → Create a new hook** e configure:
   - **Nome:** `checklist-recebido`
   - **Tabela:** `checklists`
   - **Evento:** marque **Insert**
   - **Tipo:** **HTTP Request**, método **POST**
   - **URL:** `https://SEU-PROJETO.supabase.co/functions/v1/notificar-checklist`
   - **HTTP Headers:** adicione `x-webhook-secret` com o mesmo valor do `WEBHOOK_SECRET`
7. Envie um checklist de teste e confira se o e-mail chegou.

---

## Manutenção

- **Adicionar, renomear ou desativar loja:** no Supabase, em **Table Editor → lojas**. Para tirar uma loja do formulário sem apagar o histórico, desmarque `ativa`. O nome renomeado é atualizado automaticamente nos checklists já enviados.
- **Alterar perguntas:** edite `assets/checklist.js` (lista `CATS`) e envie o arquivo de novo ao GitHub.
- **Reenvio da mesma loja:** o painel considera sempre o envio mais recente de cada loja. Os anteriores ficam guardados no banco.
- **Exportar:** os botões do painel geram CSV que abre no Excel (separador `;`).

## Estrutura dos arquivos

```
index.html                         formulário do supervisor
admin.html                         login e painel do administrador
config.js                          URL e chave pública do Supabase  ← editar
assets/checklist.js                perguntas e cálculos compartilhados
assets/form.js                     lógica do formulário
assets/admin.js                    lógica do painel
assets/style.css                   visual
assets/vendor/supabase-2.58.0.js   biblioteca do Supabase (local)
supabase/schema.sql                banco, segurança, lojas e admins  ← rodar no SQL Editor
supabase/functions/notificar-checklist/index.ts   e-mail de confirmação (opcional)
```

---

## Atualização 02: plano de ação com status, valores e relatório de gastos

**O que mudou no painel (`admin.html`):**
- **Abas:** Visão geral · Plano de ação · Gastos e relatórios.
- **Plano de ação:** para cada item com problema, você define o **status** (Não iniciado, Agendado, Em andamento, Concluído), o **valor do serviço**, o **prestador** e a **data prevista**. Tudo é salvo automaticamente, com registro de quem alterou e quando. Ao marcar "Concluído", a data de conclusão é gravada sozinha.
- **Conformidade atual:** cada ação concluída passa a contar como item conforme. A tabela "Conformidade por loja e área" e as notas das lojas sobem conforme os serviços são concluídos. A nota original da vistoria continua visível para comparação.
- **Gastos e relatórios:**
  - **Filtros:** loja, área, status, urgência e período (pela data da vistoria ou pela data de conclusão).
  - **Totais:** valor total, gasto (concluído), em execução e a iniciar.
  - **Gráfico de pizza:** agrupa por status, área, urgência, loja ou prestador.
  - **Gráfico de barras:** agrupa por loja, área, status, urgência, prestador ou mês de conclusão.
  - **Medida dos gráficos:** valor em R$ ou quantidade de ações.
  - **Tabelas:** resumo por área e por loja.
  - **Exportação:** relatório em CSV.

**Como instalar a atualização (5 minutos):**
1. No Supabase, abra **SQL Editor → New query**, cole o conteúdo de `supabase/migracao-02-plano-de-acao.sql` e clique em **Run**. O script não apaga nenhum dado.
2. No GitHub, abra o repositório `checklist-lojas` → **Add file → Upload files** e envie estes arquivos, mantendo as pastas:
   - `admin.html`
   - `assets/admin.js`
   - `assets/style.css`
   - `assets/vendor/chart-4.4.4.umd.js` (novo)
   - `supabase/schema.sql` e `supabase/migracao-02-plano-de-acao.sql` (só para manter o histórico)
3. Clique em **Commit changes**, espere 1 a 2 minutos e recarregue o painel com **Ctrl+F5**.

> Não envie o `config.js` de novo se o seu já estiver preenchido. Ele não mudou.

---

## Atualização 03: controle de contratos de locação (`contratos.html`)

Página nova, com o mesmo login do painel do checklist. Os dois painéis têm um link um para o outro no topo.

**Abas:**
- **Contratos:**
  - Painel com contratos vigentes e quantos vencem em até 6 meses, em até 12 meses e já venceram.
  - Lista dos vencidos e dos que vencem nos próximos 60 dias.
  - Lista completa, com busca e filtros.
  - Botão **Novo contrato**: loja, tempo de contrato e garantia vêm do cadastro; o locador é preenchido na hora; também tem valor da garantia (caução), status, locação, condomínio, IPTU, outros tributos, reajuste, observação e PDF do contrato.
  - Ao clicar num contrato, abrem as abas **Dados** e **Aditivo**. Ao registrar um aditivo (novo valor, novo prazo, nova data de vencimento e PDF), o contrato é atualizado e o histórico fica guardado.
- **Cadastro:**
  - **Lojas:** endereço campo a campo, com busca por CEP; regional; nova fachada e logo interna (Sim/Não); foto com data de inserção.
  - **Garantias** e **Tempo de contrato:** editáveis.
- **Minutas padrão:**
  - Envie o seu modelo em Word (.docx) com os campos entre chaves, como `{LOCADOR_NOME}`.
  - Escolha um contrato ou uma loja para preencher os campos automaticamente, edite o que quiser e gere a minuta pronta (.docx).
  - Valor por extenso e data por extenso já saem prontos.
- **Relatórios:**
  - **Filtros:** regional, UF, cidade, status, garantia, prazo, índice, padrão visual e período de vencimento.
  - **Totais:** custo mensal e anual, aluguel médio e caução.
  - **Gráficos:** pizza e barras configuráveis.
  - **Exportação:** CSV.

### Como instalar

1. **Banco:** no Supabase, abra **SQL Editor → New query**, cole `supabase/migracao-03-contratos.sql` e clique em **Run**. O script não apaga dados.
2. **Site:** no GitHub, abra **Add file → Upload files** e envie o conteúdo da pasta da atualização, mantendo as pastas. Clique em **Commit changes**.
3. Abra `https://SEU-USUARIO.github.io/checklist-lojas/contratos.html` e entre com o seu login.

### Como preparar uma minuta padrão no Word

Troque os dados variáveis do seu contrato por campos entre chaves, em maiúsculas e sem espaços. Exemplo:

> LOCADOR: **{LOCADOR_NOME}**, inscrito no CPF/CNPJ sob nº {LOCADOR_DOCUMENTO}, … aluguel mensal de R$ {VALOR_LOCACAO} ({VALOR_LOCACAO_EXTENSO}) …

**Campos preenchidos automaticamente:**
- **Loja:** `{LOJA}`, `{LOJA_ENDERECO}`, `{LOJA_LOGRADOURO}`, `{LOJA_NUMERO}`, `{LOJA_COMPLEMENTO}`, `{LOJA_BAIRRO}`, `{LOJA_CIDADE}`, `{LOJA_UF}`, `{LOJA_CEP}`
- **Locador:** `{LOCADOR_NOME}`, `{LOCADOR_TIPO}`, `{LOCADOR_DOCUMENTO}`, `{LOCADOR_RG}`, `{LOCADOR_REPRESENTANTE}`, `{LOCADOR_EMAIL}`, `{LOCADOR_TELEFONE}`, `{LOCADOR_ENDERECO}`, `{LOCADOR_BANCO}`, `{LOCADOR_AGENCIA}`, `{LOCADOR_CONTA}`, `{LOCADOR_PIX}`
- **Contrato:** `{PRAZO}`, `{PRAZO_MESES}`, `{DATA_INICIO}`, `{DATA_FIM}`, `{VALOR_LOCACAO}`, `{VALOR_LOCACAO_EXTENSO}`, `{VALOR_CONDOMINIO}`, `{VALOR_IPTU}`, `{OUTROS_TRIBUTOS}`, `{GARANTIA}`, `{VALOR_GARANTIA}`, `{VALOR_GARANTIA_EXTENSO}`, `{INDICE_REAJUSTE}`, `{MULTA_RESCISORIA}`, `{DATA_HOJE}`, `{DATA_HOJE_EXTENSO}`

Qualquer outro campo que você criar (ex.: `{TESTEMUNHA_1}`) aparece em branco para preencher na hora. O arquivo `exemplo-modelo-minuta.docx` mostra todos os campos em uso.

### Alerta de vencimento por e-mail (60 dias antes)

Todo dia às 8h, o sistema verifica os contratos que entraram na janela de 60 dias e envia **um e-mail** para Luiz e William com a lista. Cada contrato é avisado uma vez por data de vencimento; se um aditivo mudar o vencimento, ele volta a ser monitorado.

1. **Resend:** siga os itens 1 a 3 da seção "Opcional: e-mail de confirmação" (conta, domínio verificado pela TI e chave da API).
2. **Função:** no Supabase, abra **Edge Functions → Deploy a new function → Via Editor**. Use o nome `alerta-vencimentos`, cole `supabase/functions/alerta-vencimentos/index.ts`, **desative "Verify JWT"** e clique em **Deploy**.
3. **Secrets**, em **Edge Functions → Secrets** (os já criados para o checklist valem para as duas funções):

| Nome | Valor |
|---|---|
| `RESEND_API_KEY` | a chave do Resend |
| `EMAIL_REMETENTE` | `Contratos Facilities <contratos@portalnova.com.br>` |
| `EMAIL_DESTINO` | `luiz.ferreira@portalnova.com.br,william.rocha@portalnova.com.br` |
| `CRON_SECRET` | um texto aleatório longo (ex.: gere uma senha de 30 caracteres) |
| `CONTRATOS_URL` | o link da página `contratos.html` |

4. **Agendamento:**
   1. Abra `supabase/agendar-alerta-vencimentos.sql`.
   2. Troque `TROQUE_PELO_CRON_SECRET` pelo mesmo valor do `CRON_SECRET`.
   3. Rode o script no **SQL Editor**.
   4. Para conferir, abra **Integrations → Cron** (ou **Database → Cron Jobs**). O job `alerta-vencimentos-diario` deve aparecer na lista.
