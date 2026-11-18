# LeadHunter v2.1: relatório de entrega

Data: 17/11/2026 · Branch: `refactor/leadhunter-v2` · Supabase remoto: **Hunter** (`sdqfjudrpesgjdlesauk`)

## 1. Diagnóstico inicial

A base v2 já tinha persistência real no Supabase: leads, coleções N:N, histórico de status, interações, integrações, configurações, RLS por usuário e dashboard agregado (`lead_dashboard`). Por isso **não foi preciso criar tabelas nem migrations** nesta rodada.

Verificação no banco remoto Hunter, feita com a chave pública e sem login:

| Objeto                                                                                                                | Resultado                                                   |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `leads`, `collections`, `collection_leads`, `lead_status_events`, `interactions`, `api_integrations`, `user_settings` | existem; acesso anônimo **negado** (`42501`), como esperado |
| função `lead_dashboard`                                                                                               | existe; acesso anônimo negado                               |
| Auth (`/auth/v1/settings`)                                                                                            | responde; provedor Google desativado                        |

A stack real do projeto é TanStack Start, Tailwind, Radix e Supabase JS (sem Fastify, Styled Components ou Zustand). As melhorias seguem essa arquitetura, sem trocar a stack. O estado global usa `useSyncExternalStore` do próprio React, sem nova dependência.

## 2. O que foi feito

| Item do pedido                         | Implementação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4. Layout da pesquisa**              | Novo `components/SearchFilters`. Grid responsivo (1 → 2 → 5 colunas). Cada campo tem as mesmas três linhas: rótulo com altura fixa, controle `h-10` igual para input e select, e uma linha de mensagem **reservada**. Erros de validação aparecem **no próprio campo** e não deslocam os vizinhos; o botão alinha com a linha dos inputs.                                                                                                                                                                                   |
| **5. Tema claro/escuro**               | `components/ThemeToggle` (ícones Sol/Lua do Lucide) no cabeçalho de todas as páginas (desktop) e na barra superior (celular). O tema virou um store único: botão, menu da conta e Configurações ficam sincronizados, inclusive entre abas. A preferência é salva no `localStorage` e aplicada antes da pintura (sem "flash"). A transição de cores dura cerca de 300 ms e é desligada com `prefers-reduced-motion`.                                                                                                         |
| **6. Adicionar à coleção na pesquisa** | `components/AddToCollectionModal`: lista das coleções do Supabase com busca, "+ Nova coleção" (nome e descrição) sem sair da página e confirmação. Pode ser aberto por resultado (ícone na linha ou no painel de detalhes) ou para vários (selecionados). Os resultados ainda não salvos são salvos pelo `saveLeads`, com deduplicação no servidor, e depois vinculados (`upsert ... ignoreDuplicates` na PK `(collection_id, lead_id)`, sem vínculos duplicados). Filtros e resultados da busca são preservados.           |
| **7. Filtro por coleção no Kanban**    | `components/CollectionFilter` no topo do Kanban. As colunas consultam o banco com `inner join` em `collection_leads`, mantendo a paginação "Carregar mais", o arrastar e soltar e o menu "Mover para". O filtro é lembrado entre páginas e recargas; se a coleção for excluída, volta para "Todas". Há estado vazio quando a coleção não tem leads. Mover um card grava o status no banco, com reversão se falhar.                                                                                                          |
| **8. Desempenho da pesquisa**          | (a) A página re-renderizava a lista inteira e o mapa **a cada segundo** por causa do cronômetro; o timer agora fica isolado em `ProviderProgress`. (b) Linhas de resultado memoizadas. (c) Sem requisição duplicada (duplo clique ou nova submissão da mesma busca). (d) Reaproveitamento de busca idêntica concluída há menos de 10 min, com "Buscar de novo". (e) Respostas antigas são descartadas. (f) Timeouts, hedging e cache do servidor já existentes foram mantidos. A paginação de 10 por página foi preservada. |
| **9. Busca perdida ao navegar**        | `lib/search-store.ts`: a busca roda fora do ciclo de vida da página. Navegar para Coleções ou Dashboard não interrompe nem repete a busca; ao voltar, filtros, progresso, resultados, página e seleção estão lá. Um aviso aparece quando a busca termina em outra página. Após recarregar (F5), os resultados voltam do `sessionStorage`; uma busca que estava em voo aparece como "interrompida". A sessão é limpa no logout.                                                                                              |
| **3. Sincronização entre telas**       | Novo `invalidateCollectionViews()`: adicionar ou remover leads de coleções (na pesquisa, em Meus leads, no detalhe e ao excluir uma coleção) atualiza contagens, listas filtradas e o Kanban filtrado.                                                                                                                                                                                                                                                                                                                      |
| **Correção: `saveLeads`**              | Os resultados salvos eram associados de volta **pelo nome**, o que errava com filiais de mesmo nome. Agora o servidor devolve `source_id` (inseridos e duplicados) e a associação é exata.                                                                                                                                                                                                                                                                                                                                  |
| **Correção: `.env.example`**           | As duas últimas linhas redefiniam `INTEGRATIONS_ENCRYPTION_KEY=COLE_A_CHAVE_GERADA_AQUI` e o e-mail, sobrescrevendo os campos vazios. Quem copiasse o arquivo criptografaria as chaves com um texto de exemplo. As linhas foram removidas.                                                                                                                                                                                                                                                                                  |

### Arquivos

Novos: `src/components/{ThemeToggle,SearchFilters,AddToCollectionModal,CollectionFilter}/{index.tsx,styles.ts}`, `src/lib/search-store.ts`, `src/test/search-session.test.ts`, `docs/RELATORIO-V2.1.md`.

Alterados: `src/routes/_authenticated/busca.tsx`, `kanban.tsx`, `colecoes.index.tsx`, `leads.$id.tsx`, `src/components/AppShell/index.tsx`, `src/components/search/ProviderProgress.tsx`, `src/components/leads/CollectionPicker.tsx`, `src/lib/{theme,leads-api,leads.functions}.ts`, `src/styles.css`, `.env.example`, `README.md`, `docs/ARCHITECTURE.md`.

## 3. Testes executados

| Verificação                     | Resultado                                                                  |
| ------------------------------- | -------------------------------------------------------------------------- |
| `npx tsc --noEmit`              | ✅ sem erros                                                               |
| `npx eslint .` / Prettier       | ✅ 0 problemas / tudo formatado                                            |
| `npx vitest run`                | ✅ **94/94** (84 anteriores + 10 novos)                                    |
| `npx vite build`                | ✅ ok                                                                      |
| Segredos no bundle do navegador | ✅ `INTEGRATIONS_ENCRYPTION_KEY` ausente; nenhuma chave secreta            |
| Dev server + Supabase remoto    | ✅ `/auth`, `/busca`, `/kanban`, `/dashboard` respondem 200; SSR conectado |
| Banco remoto Hunter             | ✅ tabelas e função presentes; anônimo bloqueado                           |

Os novos testes (`search-session.test.ts`) cobrem: a busca continua sem a página montada e entrega os resultados a quem volta; nenhuma requisição duplicada; descarte de respostas atrasadas; cache de 10 min e "forçar"; falha não entra no cache; cancelamento preserva resultados parciais; restauração após recarga (com "interrompida"); limpeza no logout; tema global, persistido e sincronizado entre componentes.

Os testes de migrations e RLS (PGlite) continuam cobrindo isolamento entre usuários, unicidade de `collection_leads` e integridade.

## 4. Limitações (leia antes de aprovar)

1. **Não houve teste ponta a ponta autenticado no banco remoto.** Isso exige login numa conta real do Hunter, e não criei contas nem usei credenciais suas. O navegador automatizado (extensão do Chrome) não estava conectado nesta sessão. Por isso, o alinhamento visual, o modal, o filtro do Kanban e o tema foram validados por código, tipos, testes e build, **não por inspeção visual**. Roteiro sugerido (5 min): pesquisar → trocar para Coleções durante a busca → voltar; adicionar 1 e depois 3 resultados a uma coleção nova; filtrar essa coleção no Kanban e mover um card; recarregar a página; alternar o tema.
2. **Buscas não continuam com o navegador fechado.** O app roda em Cloudflare Workers/TanStack Start, sem fila de jobs. A busca sobrevive à navegação, e uma recarga mantém os resultados já recebidos. Execução em segundo plano exigiria uma fila (ex.: Cloudflare Queues ou Supabase Edge Functions + tabela de jobs). Não foi implementado porque muda a infraestrutura.
3. **Histórico de pesquisas no Supabase não foi criado.** Não havia uso para ele nas telas atuais. Gravar resultados de terceiros automaticamente também iria contra a regra de "salvar só por ação do usuário".
4. **Campos do pedido que não existem no modelo e não foram criados:** prioridade, "confiança", status de verificação do site e tabela de etapas do Kanban. As etapas são fixas em código e validadas por `CHECK` no banco. Criar esses campos muda regras de negócio. Se quiser prioridade, é uma migration aditiva pequena (`priority smallint` + filtro e índice).
5. ~~`.env` versionado no git~~ **resolvido** (seção 5).

## 5. Remoção do Lovable e proteção do `.env`

- `.env` saiu do controle do git (`git rm --cached`) e entrou no `.gitignore`. O arquivo local continua intacto. Confirmei que a `INTEGRATIONS_ENCRYPTION_KEY` **nunca** foi commitada.
- `vite.config.ts` passou a ser Vite puro: Tailwind, alias `@`, TanStack Start (com a proteção que impede importar `src/lib/server/**` no navegador), Nitro para Cloudflare no build, React e porta 8080. Substitui o `@lovable.dev/vite-tanstack-config`.
- Removidos: `@lovable.dev/vite-tanstack-config`, `previewAuthStorage.ts` (só agia em domínios de preview do Lovable), `lovable-error-reporting.ts` (telemetria do editor), `.lovable/`, `bun.lock` e `bunfig.toml` (o projeto usa npm), `drizzle/`, `drizzle.config.ts` e as dependências `drizzle-kit`, `drizzle-orm` e `postgres` (espelho de migrations do Lovable Cloud; as migrations oficiais continuam em `supabase/migrations`).
- A "estrela-guia" do produto foi preservada em `docs/ESTRELA-GUIA.md`.
- Mantidos de propósito: o comentário da migration base (migration já aplicada não se altera), o Anexo A do `SUPABASE_SETUP.md` (como trazer dados antigos do Lovable Cloud) e o `RELATORIO-V2.md` (registro histórico).
- **Fora do código:** a integração GitHub ↔ Lovable precisa ser desconectada no painel do Lovable (Settings → GitHub). Enquanto estiver ligada, o Lovable continua recebendo os commits do repositório.

## 6. Auditoria de dependências (`npm audit`)

Rodei `npm audit fix` (somente atualizações compatíveis; `package.json` inalterado, só o `package-lock.json` mudou):

| Pacote        | Antes  | Depois | Alerta corrigido                                        |
| ------------- | ------ | ------ | ------------------------------------------------------- |
| zod           | <4.6.6 | 4.6.7  | consumo de memória ao validar coleções grandes          |
| seroval       | 1.6.8  | 1.8.2  | injeção de script/código na serialização (usado no SSR) |
| nanoid        | 3.3.16 | 3.3.20 | loop infinito com gerador customizado                   |
| js-yaml       | 4.3.0  | 4.3.2  | consumo quadrático de CPU                               |
| source-map-js | 1.2.1  | 1.2.2  | negação de serviço por source map malicioso             |

Produção: **16 → 11 alertas**, e os 11 restantes (19 contando ferramentas de desenvolvimento) têm uma única origem: **`picomatch` ≤ 4.0.7** (ReDoS com padrões extglob, GHSA-fc5q-39xc-vjpf). Ainda **não existe versão corrigida** (4.0.7 é a mais recente). Ele só é usado pelas ferramentas de build (Vite e gerador de rotas do TanStack), com padrões de arquivo do próprio projeto, e **não entra no bundle publicado** (verificado em `.output`). O `npm audit fix --force` foi recusado de propósito: ele faria _downgrade_ do Vite 8 → 6.2.7 e do TanStack Start → 1.160, quebrando o projeto sem resolver o problema. Quando sair o `picomatch` 4.0.8, basta rodar `npm audit fix` de novo.

Validação após a atualização: `tsc` ✅ · ESLint ✅ · Prettier ✅ · Vitest **94/94** ✅ · `vite build` ✅.

## 7. Melhorias da revisão (segurança, fluxo, layout e prioridade)

### ⚠️ Ação necessária antes de usar esta versão

Aplique no Supabase **Hunter** a migration `supabase/migrations/20261118000100_lead_priority.sql`:

- **Painel:** Supabase → SQL Editor → New query → cole o conteúdo do arquivo → **Run**; ou
- **CLI:** `npx supabase link --project-ref sdqfjudrpesgjdlesauk` e depois `npx supabase db push` (pede a senha do banco).

A migration é aditiva e idempotente (pode rodar duas vezes): cria a coluna `priority` com padrão "média" em todos os leads existentes, a restrição 1–3 e um índice. Nada é apagado. A reversão está em `supabase/rollback/20261118000100_lead_priority.down.sql`. **Sem a migration, o Kanban e Meus leads mostram erro**, porque o código já lê a coluna.

### O que foi feito

| Item                                 | Implementação                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cabeçalhos de segurança**          | `src/lib/security-headers.ts` aplicado em `src/server.ts`: CSP (produção), HSTS (produção), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `COOP`. Verificado num servidor de produção local: os 7 cabeçalhos presentes; a página só carrega recursos permitidos (próprio site e Google Fonts); a server function sem login responde 403.                                                                                                  |
| **Cancelamento até o servidor**      | O sinal de abort da requisição HTTP é repassado ao Overpass, ao Nominatim e às APIs próprias. Conferi no adaptador Node (`srvx`) que o sinal só dispara se a conexão cair antes da resposta (não há cancelamento prematuro); no Cloudflare Workers é o comportamento padrão.                                                                                                                                                                                              |
| **Busca visível em qualquer página** | Indicador girando no item "Pesquisar leads" do menu enquanto a busca roda; o aviso de conclusão ganhou o botão **"Ver resultados"** quando o usuário está em outra página.                                                                                                                                                                                                                                                                                                |
| **Select igual ao Input**            | `ui/select.tsx`: mesmo raio, fundo do tema, sombra, hover e foco do `Input`, em todo o app.                                                                                                                                                                                                                                                                                                                                                                               |
| **"Fechar" em português**            | Rótulo de leitor de tela dos botões de fechar (`dialog.tsx`, `sheet.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                |
| **Fundo dos modais**                 | De preto 80% para 55% com leve desfoque (`dialog`, `alert-dialog`, `sheet`).                                                                                                                                                                                                                                                                                                                                                                                              |
| **Prioridade do lead**               | 3 níveis (Alta, Média, Baixa), guardados como 3/2/1, padrão Média. **Meus leads:** filtro, coluna ordenável e ação em lote. **Detalhe:** seletor ao lado do status. **Kanban:** selo no card, sem mudar a ordem (o selo "Média" fica oculto para reduzir ruído). **Importar/Exportar:** coluna "prioridade" (aceita "Alta", "3", "high", "urgente"…; a exportação grava o nome). O selo usa contorno, não preenchimento, para não ser confundido com os status coloridos. |
| **`npm run preview`**                | Passou a servir o build do Nitro (antes procurava `dist/server`, que não existe). No Windows o Nitro não consegue abrir o simulador do Cloudflare (`spawn npx` falha); para testar o build localmente, veja abaixo.                                                                                                                                                                                                                                                       |

### Testes

`tsc` ✅ · ESLint ✅ · Prettier ✅ · Vitest **105/105** ✅ (11 novos: migration de prioridade com padrão, faixa, isolamento entre usuários e reversão; conversão de prioridade; importação/exportação; CSP e cabeçalhos) · `vite build` (Cloudflare) ✅ · servidor de produção local (preset Node) com os cabeçalhos conferidos ✅.

Para testar o build de produção localmente no Windows:

```powershell
$env:NITRO_PRESET="node-server"; npx vite build; Remove-Item Env:NITRO_PRESET
$env:PORT=4173; node .output/server/index.mjs      # http://localhost:4173
npx vite build                                      # volta ao build de Cloudflare
```

### Não verificado

- **Visual**: o selo de prioridade, o novo estilo do Select e o fundo dos modais não foram vistos na tela (sem navegador conectado).
- **Prioridade contra o banco remoto**: depende da migration ser aplicada; a lógica foi testada no Postgres em memória (PGlite) com as mesmas políticas RLS.
- **CSP com o mapa em um navegador real**: as origens do OpenFreeMap (estilo, tiles, fontes e sprites) estão liberadas e o worker `blob:` também. Mesmo assim, se o mapa não carregar em produção, o console do navegador vai mostrar a origem bloqueada.
