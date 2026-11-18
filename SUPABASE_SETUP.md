# Configurando o LeadHunter com o seu próprio Supabase

Este guia mostra, passo a passo e partindo do zero, como criar um projeto no **Supabase**, preparar o banco de dados e a autenticação e rodar o LeadHunter no seu computador **Windows** com VS Code.

> **Convenções deste guia**
>
> - 🖥️ **Terminal do VS Code**: abra com `Ctrl + '` (aspas simples). Por padrão é o **PowerShell**. Os comandos marcados como **CMD** são para o Prompt de Comando.
> - 📁 Salvo indicação contrária, rode os comandos **na pasta do projeto** (onde está o `package.json`). Exemplo: `cd C:\Trabalho\LeadHunter`.
> - 🌐 Os passos com "Painel" são feitos no site do Supabase.
> - Onde aparecer `<algo>`, substitua pelo seu valor (sem os sinais `<` e `>`).

---

## Sumário

- [Configurando o LeadHunter com o seu próprio Supabase](#configurando-o-leadhunter-com-o-seu-próprio-supabase)
  - [Sumário](#sumário)
  - [Pré-requisitos](#pré-requisitos)
  - [1. Acessar o Supabase](#1-acessar-o-supabase)
  - [2. Criar uma conta](#2-criar-uma-conta)
  - [3. Criar um novo projeto](#3-criar-um-novo-projeto)
  - [4. Escolher a região e configurar o projeto](#4-escolher-a-região-e-configurar-o-projeto)
  - [5. Encontrar a URL e a chave publicável](#5-encontrar-a-url-e-a-chave-publicável)
  - [6. Configurar as credenciais privadas do backend](#6-configurar-as-credenciais-privadas-do-backend)
  - [7. Instalar e configurar o Supabase CLI](#7-instalar-e-configurar-o-supabase-cli)
  - [8. Aplicar todas as migrations](#8-aplicar-todas-as-migrations)
  - [9. Verificar tabelas e relacionamentos](#9-verificar-tabelas-e-relacionamentos)
  - [10. Políticas RLS](#10-políticas-rls)
  - [11. Autenticação por e-mail e senha](#11-autenticação-por-e-mail-e-senha)
  - [12. Login com Google](#12-login-com-google)
  - [13. Recuperação de senha e redirecionamentos](#13-recuperação-de-senha-e-redirecionamentos)
  - [14. Preencher o arquivo `.env`](#14-preencher-o-arquivo-env)
  - [15. Executar frontend e backend localmente](#15-executar-frontend-e-backend-localmente)
  - [16. Validar a conexão com o banco](#16-validar-a-conexão-com-o-banco)
  - [17. Testar o isolamento entre usuários](#17-testar-o-isolamento-entre-usuários)
  - [18. Configurar futuras integrações de APIs](#18-configurar-futuras-integrações-de-apis)
  - [19. Aplicar novas migrations sem perder dados](#19-aplicar-novas-migrations-sem-perder-dados)
  - [20. Diagnóstico dos erros mais comuns](#20-diagnóstico-dos-erros-mais-comuns)
  - [Anexo A: migrar dados do Lovable Cloud](#anexo-a-migrar-dados-do-lovable-cloud)
  - [Anexo B: publicar em produção](#anexo-b-publicar-em-produção)
  - [Anexo C: Supabase local com Docker (opcional)](#anexo-c-supabase-local-com-docker-opcional)

[Anexo A: migrar dados do Lovable Cloud](#anexo-a-migrar-dados-do-lovable-cloud) · [Anexo B: publicar em produção](#anexo-b-publicar-em-produção) · [Anexo C: Supabase local com Docker](#anexo-c-supabase-local-com-docker-opcional)

---

## Pré-requisitos

| Ferramenta | Versão                          | Como instalar (PowerShell)                  | Como conferir    |
| ---------- | ------------------------------- | ------------------------------------------- | ---------------- |
| Node.js    | 20 ou superior (testado com 24) | `winget install OpenJS.NodeJS.LTS`          | `node --version` |
| Git        | qualquer recente                | `winget install Git.Git`                    | `git --version`  |
| VS Code    | qualquer                        | `winget install Microsoft.VisualStudioCode` | —                |

Depois de instalar, **feche e abra o VS Code** para o terminal reconhecer os novos programas.

Instale as dependências do projeto (uma vez):

```powershell
# 📁 pasta do projeto
npm install
```

---

## 1. Acessar o Supabase

Abra <https://supabase.com> no navegador e clique em **Start your project** (ou **Sign in**, se já tiver conta).

## 2. Criar uma conta

1. Escolha **Continue with GitHub** (recomendado) ou cadastre-se com e-mail e senha.
2. Se usar e-mail, confirme o endereço pelo link que o Supabase enviar.
3. Na primeira entrada, o Supabase pede para criar uma **organização** (Organization). Use, por exemplo, o nome da sua empresa. O plano **Free** atende para começar.

## 3. Criar um novo projeto

1. 🌐 No painel, clique em **New project**.
2. Escolha a organização.
3. **Project name**: `leadhunter` (ou outro nome).
4. **Database Password**: clique em **Generate a password** e **guarde essa senha num gerenciador de senhas**. Ela é necessária para o Supabase CLI (passo 7) e não é exibida de novo.
5. Clique em **Create new project** e aguarde de 1 a 2 minutos até o status ficar **Healthy**.

## 4. Escolher a região e configurar o projeto

- **Region**: escolha **South America (São Paulo) — `sa-east-1`**. É a menor latência para usuários no Brasil e mantém os dados no país, o que ajuda na LGPD.
- **Compute size**: o padrão do plano Free é suficiente.
- Depois de criado, em **Project Settings → General**, anote o **Reference ID** (algo como `abcdefghijklmnop`). Ele é o `<project-ref>` usado no CLI.

## 5. Encontrar a URL e a chave publicável

1. 🌐 Clique em **Connect** no topo do painel (ou vá em **Project Settings → API Keys**).
2. Copie:
   - **Project URL**: `https://<project-ref>.supabase.co` → vai em `VITE_SUPABASE_URL`.
   - **Publishable key** (`sb_publishable_...`) → vai em `VITE_SUPABASE_PUBLISHABLE_KEY`.
     Se o seu projeto só mostrar as chaves legadas, use a **anon public** (um JWT longo).

> ⚠️ **Nunca** use a **secret key** (`sb_secret_...`) nem a **service_role** no `.env` do LeadHunter. O app **não precisa delas** e se recusa a iniciar se uma delas for colocada no lugar da chave pública. A segurança dos dados vem das políticas RLS (passo 10), que valem para a chave pública.

## 6. Configurar as credenciais privadas do backend

O LeadHunter tem server functions (rodam só no servidor) que usam **um único segredo próprio**:

| Variável                      | Para que serve                                                                            | Obrigatória?                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `INTEGRATIONS_ENCRYPTION_KEY` | Criptografa (AES-256-GCM) as chaves das suas APIs personalizadas antes de gravar no banco | Só se você for cadastrar APIs com chave/cabeçalho de autenticação |

Gere um valor aleatório:

```powershell
# 🖥️ PowerShell (qualquer pasta)
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

ou, com Node (PowerShell ou CMD):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copie o resultado para o `.env.local` (passo 14). **Guarde-o com segurança**: se ele mudar, as chaves de API já salvas não poderão ser lidas e precisarão ser digitadas de novo.

> Variáveis **sem** o prefixo `VITE_` nunca são enviadas ao navegador. As com `VITE_` são públicas por definição.

## 7. Instalar e configurar o Supabase CLI

O CLI aplica as migrations versionadas da pasta `supabase/migrations`.

**Opção 1: via `npx` (sem instalar nada global)**

```powershell
# 📁 pasta do projeto
npx supabase@latest --version
```

> Se aparecer um aviso de _allow-scripts_ do npm e o comando não funcionar, rode `npm approve-scripts supabase` e tente de novo, ou use a Opção 2.

**Opção 2: instalação permanente com Scoop**

```powershell
# 🖥️ PowerShell (qualquer pasta)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version
```

> Nos comandos abaixo, use `npx supabase` (Opção 1) ou só `supabase` (Opção 2).

**Fazer login e vincular o projeto**

```powershell
# 📁 pasta do projeto
npx supabase login
# abre o navegador para autorizar; volte ao terminal quando terminar

npx supabase link --project-ref <project-ref>
# vai pedir a Database Password do passo 3
```

O vínculo fica salvo em `supabase/.temp/` (pasta ignorada pelo git).

## 8. Aplicar todas as migrations

As migrations ficam em `supabase/migrations/` e são aplicadas em ordem:

| Arquivo                            | Conteúdo                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261117000100_base_schema.sql`   | Tabelas `leads`, `collections`, `collection_leads`, `interactions`, `api_integrations` com RLS (equivalente ao schema original do Lovable) |
| `20261117000200_v2_hardening.sql`  | Histórico de status, configurações por usuário, limites de uso, RLS reforçada, índices, restrições de integridade e função do dashboard    |
| `20261118000100_lead_priority.sql` | Coluna `priority` em `leads` (1 baixa · 2 média · 3 alta, padrão 2), restrição e índice. Aditiva: leads existentes viram "média"           |

**Opção A: pelo CLI (recomendado)**

```powershell
# 📁 pasta do projeto
npx supabase db push --dry-run   # mostra o que será aplicado, sem aplicar
npx supabase db push             # aplica
npx supabase migration list      # confirma: colunas "Local" e "Remote" iguais
```

**Opção B: sem CLI, pelo SQL Editor**

1. 🌐 Painel → **SQL Editor** → **New query**.
2. No VS Code, abra `supabase/migrations/20261117000100_base_schema.sql`, copie **todo** o conteúdo, cole no editor e clique em **Run**.
3. Repita com `20261117000200_v2_hardening.sql` e depois com `20261118000100_lead_priority.sql`.

> As duas migrations são **idempotentes**: rodar de novo não duplica nada nem apaga dados. Se usar a Opção B, o CLI não saberá que elas foram aplicadas. Para continuar com o CLI depois, registre-as com `npx supabase migration repair --status applied 20261117000100 20261117000200`.

## 9. Verificar tabelas e relacionamentos

🌐 Painel → **Table Editor**. Você deve ver:

| Tabela                                 | Para que serve                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `leads`                                | Empresas salvas (com `status`, `status_changed_at`, `whatsapp`, `linkedin`, `name_key`…) |
| `lead_status_events`                   | Histórico de cada mudança de status (alimenta "ganhos por semana")                       |
| `interactions`                         | Ligações, notas, reuniões etc. de cada lead                                              |
| `collections` / `collection_leads`     | Coleções e seus leads                                                                    |
| `api_integrations`                     | APIs personalizadas (chave em `secret_ciphertext`, criptografada)                        |
| `user_settings`                        | Preferências por usuário (UF/cidade padrão, provedores, guia)                            |
| `rate_limit_hits`, `provider_throttle` | Controle interno de limites de uso (sem acesso pelo app)                                 |

Para ver os relacionamentos: 🌐 **Database → Schema Visualizer**. Ou rode no **SQL Editor**:

```sql
select conrelid::regclass as tabela, conname as restricao, pg_get_constraintdef(oid) as definicao
from pg_constraint
where connamespace = 'public'::regnamespace and contype in ('f','u','c')
order by 1, 2;
```

Confira também as funções:

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('lead_dashboard','consume_rate_limit','acquire_provider_slot','leads_track_status');
-- deve retornar as 4 linhas
```

## 10. Políticas RLS

As migrations **já criam e ativam** todas as políticas, e não é preciso clicar em nada. Para conferir:

🌐 Painel → **Authentication → Policies** (ou **Database → Policies**). Cada tabela deve mostrar **RLS enabled** e:

| Tabela                                                      | Regra                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `leads`, `collections`, `api_integrations`, `user_settings` | o usuário só lê e escreve linhas com `user_id = auth.uid()`               |
| `interactions`                                              | idem, **e** o `lead_id` precisa ser um lead do próprio usuário            |
| `collection_leads`                                          | idem, **e** tanto a coleção quanto o lead precisam ser do próprio usuário |
| `lead_status_events`                                        | somente leitura das próprias linhas (gravação só pelo gatilho do banco)   |
| `rate_limit_hits`, `provider_throttle`                      | nenhum acesso direto (só pelas funções `SECURITY DEFINER`)                |

Via SQL:

```sql
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;  -- todas "true"
```

> O usuário anônimo (`anon`) não tem acesso a nenhuma tabela do app.

## 11. Autenticação por e-mail e senha

🌐 Painel → **Authentication**:

1. **Sign In / Providers → Email**: deixe **Enable Email provider** ligado.
   - **Confirm email**: ligado (recomendado). O usuário precisa clicar no link antes de entrar.
   - **Secure password change**: pode ficar ligado. O app pede a senha atual e reautentica antes da troca.
2. **Sign In / Providers → (seção Password / Auth settings)**:
   - **Minimum password length**: `8`.
   - **Password requirements**: _Letters and digits_ (o app já exige isso na tela).
   - **Leaked password protection**: ative se o seu plano permitir.
3. **E-mails em produção**: o servidor de e-mail padrão do Supabase serve só para testes, com limite de poucas mensagens por hora. Antes de abrir o app para clientes, configure um SMTP próprio (Resend, Brevo, Amazon SES…) em **Project Settings → Authentication → SMTP Settings**.
4. (Opcional) **Emails → Templates**: traduza os modelos para português.

## 12. Login com Google

**No Google Cloud Console**

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ou use um existente).
2. **APIs & Services → OAuth consent screen**: tipo **External**. Preencha nome do app, e-mail de suporte e domínio. Em _Scopes_, os padrões `email`, `profile` e `openid` bastam.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type**: _Web application_.
   - **Authorized JavaScript origins**: `http://localhost:8080` e a URL de produção (ex.: `https://app.seudominio.com.br`).
   - **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
     (copie o valor exato mostrado no Supabase, item abaixo).
4. Copie o **Client ID** e o **Client secret**.

**No Supabase**

5. 🌐 **Authentication → Sign In / Providers → Google**: ative, cole o _Client ID_ e o _Client Secret_, confira o _Callback URL_ e salve.

**No LeadHunter**

6. No `.env.local`, mantenha `VITE_AUTH_GOOGLE_ENABLED=true`. Para esconder o botão, use `false`.

> O login com Google agora fala **direto com o seu Supabase**. O intermediário de OAuth do Lovable Cloud (`@lovable.dev/cloud-auth-js`) foi removido.

## 13. Recuperação de senha e redirecionamentos

🌐 Painel → **Authentication → URL Configuration**:

| Campo             | Valor                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Site URL**      | URL de produção, ex.: `https://app.seudominio.com.br` (enquanto só roda local: `http://localhost:8080`) |
| **Redirect URLs** | `http://localhost:8080/**` · `http://127.0.0.1:8080/**` · `https://app.seudominio.com.br/**`            |

O app usa estes destinos:

| Fluxo                   | Redireciona para        |
| ----------------------- | ----------------------- |
| Confirmação de cadastro | `<site>/dashboard`      |
| Login com Google        | `<site>/dashboard`      |
| "Esqueci minha senha"   | `<site>/reset-password` |

`<site>` é `VITE_SITE_URL` ou, se vazio, a origem atual do navegador. **Toda URL usada precisa estar em Redirect URLs**; caso contrário, o Supabase manda o usuário para a _Site URL_.

Para testar a recuperação: tela de login → **Esqueci minha senha** → abra o e-mail → o link leva a `/reset-password` → defina a nova senha. As outras sessões abertas são encerradas automaticamente.

## 14. Preencher o arquivo `.env`

Crie o seu `.env` (ou `.env.local`, que tem prioridade) a partir do modelo. Os dois são ignorados pelo git e **nunca** devem ser commitados:

```powershell
# 📁 pasta do projeto — PowerShell
Copy-Item .env.example .env.local
code .env.local
```

```bat
:: 📁 pasta do projeto — CMD
copy .env.example .env.local
code .env.local
```

Preencha no mínimo:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
INTEGRATIONS_ENCRYPTION_KEY=<valor gerado no passo 6>
PROVIDER_CONTACT_EMAIL=<seu e-mail de contato>
```

Todas as outras variáveis são opcionais e documentadas no próprio `.env.example`: provedores Overpass, Nominatim e BrasilAPI, limites de uso, integrações. O app funciona só com os provedores habilitados. Por exemplo, `OVERPASS_ENABLED=false` desliga o Overpass sem quebrar nada.

> Depois de alterar o `.env.local`, **reinicie** o `npm run dev`.

## 15. Executar frontend e backend localmente

Frontend e backend (server functions) sobem juntos, num único comando:

```powershell
# 📁 pasta do projeto
npm run dev
```

Acesse <http://localhost:8080>. Para parar, use `Ctrl + C` no terminal.

Outros comandos úteis:

```powershell
npm run check       # typecheck + lint + testes automatizados
npm run build       # build de produção (gera .output/)
npm run preview     # serve o build de produção localmente
```

## 16. Validar a conexão com o banco

1. Abra <http://localhost:8080>. Você será levado para **/auth**.
2. Clique em **Não tem conta? Criar agora**, cadastre-se e confirme o e-mail.
3. Entre e abra **Meus leads → Novo lead**. Crie um lead de teste.
4. 🌐 Painel → **Table Editor → leads**: a linha deve aparecer com o seu `user_id`.
5. 🌐 **Table Editor → lead_status_events**: deve haver um evento `null → novo` para esse lead.
6. Mova o lead no **Kanban** e confira um novo evento (`novo → contato`, por exemplo). O **Dashboard** passa a contar o lead.

Se a tela de login mostrar erro de conexão, veja o [passo 20](#20-diagnóstico-dos-erros-mais-comuns).

## 17. Testar o isolamento entre usuários

**Teste manual (no app)**

1. Usuário **A**: crie alguns leads e uma coleção.
2. Saia e cadastre o usuário **B** (outro e-mail; uma janela anônima ajuda).
3. B não deve ver nada de A: nem leads, nem coleções, nem Dashboard.
4. Copie da barra de endereço o ID de um lead de A (`/leads/<id>`) e abra a mesma URL logado como B: deve aparecer **"Lead não encontrado"**.

**Teste por SQL (no SQL Editor)**, simulando o usuário B:

```sql
begin;
-- troque pelo UUID do usuário B (Authentication → Users)
select set_config('request.jwt.claims', '{"sub":"<uuid-do-usuario-B>","role":"authenticated"}', true);
set local role authenticated;
select count(*) as leads_visiveis from public.leads;          -- só os de B
insert into public.interactions (lead_id, content)
  values ('<uuid-de-um-lead-de-A>', 'tentativa');                -- deve falhar: row-level security
rollback;
```

**Teste automatizado**: `npm test` roda `src/test/migrations.test.ts`, que aplica todas as migrations num Postgres em memória e verifica o isolamento (leitura, escrita, referência a dados alheios, falsificação de `user_id` e acesso anônimo).

## 18. Configurar futuras integrações de APIs

**APIs personalizadas pelo app (sem código)**: menu **Integrações de API**.

- **Link**: use `{niche}`, `{uf}`, `{city}` e `{limit}`, por exemplo `https://api.exemplo.com/empresas?q={niche}&uf={uf}`.
- **Cabeçalho/valor**: a chave é criptografada no servidor (requer `INTEGRATIONS_ENCRYPTION_KEY`) e nunca volta para o navegador.
- **Caminho da lista**: por exemplo `data.results`. Vazio faz o app detectar a primeira lista.
- Segurança aplicada: somente `https://`, domínios públicos (IPs internos, `localhost` e endereços de metadata bloqueados, inclusive após redirecionamentos e resolução DNS), resposta máxima de 2 MB e tempo máximo de 15 s.

**Novo provedor nativo (com código)**: crie `src/lib/server/providers/<nome>.server.ts` (veja `overpass.server.ts` como modelo), chame-o em `src/lib/search.functions.ts` e adicione as variáveis no `env.server.ts` e no `.env.example`. A tabela `user_settings.providers` (JSON) já aceita a chave de liga/desliga do novo provedor. Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 19. Aplicar novas migrations sem perder dados

1. Crie o arquivo da migration:

   ```powershell
   npx supabase migration new descricao_da_mudanca
   # cria supabase/migrations/<timestamp>_descricao_da_mudanca.sql
   ```

2. Escreva SQL **aditivo e idempotente**: `add column if not exists`, `create index if not exists`, `create or replace function`, `drop policy if exists` + `create policy`. Para novas regras de validação em tabelas com dados, use `... not valid`.
3. Teste localmente: `npm test`. O teste de migrations aplica todos os arquivos num banco limpo **e** num banco "legado".
4. Faça backup antes de aplicar em produção. 🌐 Painel → **Database → Backups**, ou, com Docker instalado:

   ```powershell
   npx supabase db dump --data-only -f backup-dados.sql
   ```

5. Confira e aplique:

   ```powershell
   npx supabase db push --dry-run
   npx supabase db push
   ```

6. Atualize os tipos TypeScript. No PowerShell, **não use `>`**, que grava em UTF-16:

   ```powershell
   npx supabase gen types typescript --linked | Out-File -Encoding utf8 src/integrations/supabase/types.ts
   ```

   ```bat
   :: CMD
   npx supabase gen types typescript --linked > src\integrations\supabase\types.ts
   ```

**Reverter**: cada migration da v2 tem um script de reversão manual em `supabase/rollback/`. Leia o cabeçalho antes: ele avisa quais dados seriam perdidos.

## 20. Diagnóstico dos erros mais comuns

| Sintoma                                                              | Causa provável                                                          | Solução                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Tela branca ou erro `Missing Supabase environment variable(s)`       | `.env.local` sem `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` | Preencha (passo 14) e reinicie o `npm run dev`                                           |
| `A secret/service_role key was configured as the public key`         | Chave secreta colocada em `VITE_SUPABASE_PUBLISHABLE_KEY`               | Use a _publishable_ ou _anon_ (passo 5) e **rotacione** a chave exposta no painel        |
| "E-mail ou senha inválidos" logo após cadastrar                      | E-mail ainda não confirmado                                             | Clique no link do e-mail; em **Authentication → Users** é possível confirmar manualmente |
| E-mail de confirmação ou recuperação não chega                       | Limite do SMTP padrão ou spam                                           | Veja a caixa de spam e configure SMTP próprio (passo 11)                                 |
| Link de recuperação leva ao início, e não a `/reset-password`        | URL fora de **Redirect URLs**                                           | Adicione `http://localhost:8080/**` e a URL de produção (passo 13)                       |
| "Este link é inválido ou expirou"                                    | Link já usado ou com mais de 1 h                                        | Peça um novo link                                                                        |
| Google: `redirect_uri_mismatch`                                      | Callback diferente no Google Cloud                                      | Use exatamente `https://<ref>.supabase.co/auth/v1/callback` (passo 12)                   |
| Google: "Login com Google não está habilitado"                       | Provedor desligado no Supabase                                          | Ative-o (passo 12) ou use `VITE_AUTH_GOOGLE_ENABLED=false`                               |
| "Você não tem permissão para esta operação"                          | RLS bloqueou (sessão de outro usuário ou migration faltando)            | Rode `npx supabase migration list`; se faltar migration, use `db push`                   |
| `function lead_dashboard does not exist` ou dashboard vazio com erro | Migration v2 não aplicada                                               | Aplique `20261117000200_v2_hardening.sql` (passo 8)                                      |
| `column leads.priority does not exist` (Kanban/Meus leads com erro)  | Migration de prioridade não aplicada                                    | Aplique `20261118000100_lead_priority.sql` (passo 8)                                     |
| "Muitas solicitações em pouco tempo"                                 | Limite por minuto atingido                                              | Aguarde 1 minuto ou ajuste `RATE_LIMIT_*` no `.env.local`                                |
| Busca: OpenStreetMap "demorou demais" ou "limite de uso atingido"    | Servidores públicos sobrecarregados                                     | Tente em alguns minutos, informe a cidade ou ajuste `OVERPASS_ENDPOINTS`                 |
| "O servidor não tem INTEGRATIONS_ENCRYPTION_KEY configurada"         | Chave de criptografia ausente                                           | Gere e configure (passo 6)                                                               |
| "não foi possível ler a chave salva"                                 | `INTEGRATIONS_ENCRYPTION_KEY` mudou                                     | Volte a chave anterior ou edite a integração e digite a chave de API de novo             |
| `supabase link` pede senha e falha                                   | Senha do banco incorreta                                                | Redefina em **Project Settings → Database → Reset database password**                    |
| `db push`: "Remote migration versions not found in local"            | Migrations aplicadas por fora do CLI                                    | `npx supabase migration repair --status applied <versão>`                                |
| `npm run dev`: porta 8080 em uso                                     | Outro processo na porta                                                 | `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess` e encerre-o       |

---

## Anexo A: migrar dados do Lovable Cloud

Os dados atuais estão no banco do Lovable Cloud. **Nada é apagado automaticamente** e o projeto antigo continua intacto.

**Caminho simples (por usuário, sem acesso técnico ao banco antigo)**

1. Antes de trocar o `.env`, entre no app ainda conectado ao Lovable Cloud.
2. **Importar / Exportar → Excel** (ou **Backup completo**) e salve o arquivo.
3. Configure o novo Supabase (passos 1 a 14) e crie a conta de novo.
4. **Importar / Exportar → Importar** o arquivo exportado. Nome, contatos, endereço, segmento, status e notas são preservados, e os duplicados são detectados.

> Limitações: interações, coleções e o histórico de status não entram na importação por planilha. As **contas de usuário não migram**, porque cada pessoa precisa se cadastrar de novo no novo projeto. Os IDs dos leads mudam.

**Caminho completo (administrador com acesso ao banco antigo)**

Se você tiver a string de conexão do banco do Lovable Cloud:

1. Exporte somente os dados das tabelas `public.*` (`pg_dump --data-only --schema=public`).
2. Crie os usuários no novo projeto (**Authentication → Users → Add user**).
3. Antes de importar, substitua os `user_id` antigos pelos novos (um `update ... set user_id = '<novo>' where user_id = '<antigo>'` por tabela, dentro de uma transação).
4. Importe e então aplique `20261117000200_v2_hardening.sql`, que reconstrói o histórico estimado de status.

## Anexo B: publicar em produção

O build gera um Worker da Cloudflare (`.output/`). Para publicar na sua própria conta Cloudflare:

```powershell
# 📁 pasta do projeto
npm run build
npx wrangler login
npx wrangler secret put INTEGRATIONS_ENCRYPTION_KEY --config .output/server/wrangler.json
npx wrangler deploy --config .output/server/wrangler.json
```

As variáveis `VITE_*` precisam estar no ambiente **no momento do build**, porque são embutidas no JavaScript do navegador. As demais vão como _secrets_ ou _vars_ do Worker. Depois, adicione a URL publicada em **Site URL** e **Redirect URLs** (passo 13) e nas origens do Google (passo 12).

O projeto não depende mais do Lovable: o build é Vite puro (`vite.config.ts`) e a publicação é feita como acima.

## Anexo C: Supabase local com Docker (opcional)

Para desenvolver sem internet ou testar migrations num Supabase completo no seu PC:

```powershell
# requer Docker Desktop aberto
npx supabase start          # sobe Postgres, Auth, API e Studio locais; aplica as migrations
npx supabase status         # mostra a API URL (http://127.0.0.1:54321) e a anon/publishable key
```

Coloque esses valores no `.env.local`. O Studio fica em <http://127.0.0.1:54323> e os e-mails de teste (confirmação e recuperação) em <http://127.0.0.1:54324>. Para parar: `npx supabase stop`.
