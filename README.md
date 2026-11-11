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
