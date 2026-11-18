# Arquitetura do LeadHunter

## Visão geral

```
Navegador (React 19 + TanStack Router/Query)
 │  ├─ CRUD simples ──────────────► Supabase PostgREST (sessão do usuário → RLS)
 │  └─ server functions (RPC) ───┐   leads-api.ts
 │                               ▼
Servidor (TanStack Start em Cloudflare Workers)
 │  requireSupabaseAuth: valida o JWT e cria um cliente Supabase "como o usuário"
 │  *.functions.ts → src/lib/server/** (carregados só no servidor)
 │     ├─ rate limit (Postgres: consume_rate_limit)
 │     ├─ Overpass (espelhos hedged + cache) · Nominatim (1 req/s global) · BrasilAPI
 │     └─ APIs personalizadas (guardedFetch anti-SSRF + segredo AES-GCM)
 ▼
Supabase (Postgres + Auth). RLS em todas as tabelas; nenhuma chave service_role é usada.
```

**Princípios**

1. **O banco é a fronteira de segurança.** Toda leitura e escrita usa o JWT do usuário, então o RLS garante o isolamento mesmo se o código do cliente for adulterado. O app não usa a chave `service_role`.
2. **Validação dupla com o mesmo schema** (`src/lib/schemas.ts`, Zod): no formulário e de novo na server function.
3. **Lógica pura separada da rede**: `osm.ts`, `custom-api.ts`, `normalize.ts`, `dedupe.ts`, `import.ts`, `net-guard.ts` não fazem I/O e são testados unitariamente.
4. **Nunca inventar dados**: normalizadores só reformatam; valores inválidos viram `null`.

## Estrutura de pastas

```
src/
  routes/                      páginas (TanStack file routes)
    _authenticated/            área logada (guard de sessão + AppShell)
      busca · leads.index · leads.$id · kanban · colecoes.index · colecoes.$id
      dashboard · importar · integracoes · configuracoes
    auth.tsx · reset-password.tsx
  components/
    AppShell/                  layout, sidebar recolhível, menu mobile (Sheet), tema
    common/                    EmptyState, StatusBadge, Pager, Field, ConfirmDialog, skeletons, ContactLinks
    leads/ · collections/ · search/ · dashboard/ · LeadMap/
    ui/                        primitivos shadcn/Radix (apenas os usados)
  lib/
    *.functions.ts             server functions (search, leads, integrations)
    server/                    SOMENTE servidor (*.server.ts): env, safe-fetch, crypto, rate-limit, cache, providers/
    leads-api.ts               acesso a dados no cliente (React Query)
    schemas.ts · constants.ts · errors.ts · auth.ts · theme.ts
    normalize.ts · dedupe.ts · osm.ts · custom-api.ts · import.ts · spreadsheet.ts · net-guard.ts
  integrations/supabase/       cliente, middleware de auth, tipos do banco
  test/                        Vitest (domínio, segurança, provedores, migrations/RLS)
supabase/
  migrations/                  migrations versionadas (Supabase CLI)
  rollback/                    scripts de reversão manual
  config.toml                  configuração do Supabase local
```

## Banco de dados

| Tabela                                 | Chaves e índices principais                                                                                                                                                                                      | Observações                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `leads`                                | `priority` 1–3 (padrão 2) com índice `(user_id, priority desc, created_at desc)`; `unique(user_id, source, source_id)`, `unique(user_id, cnpj)` parcial*, índices por `created_at`, `name_key`, `city`, `status` | `name_key` é uma coluna gerada (nome normalizado) para deduplicação indexada                                  |
| `lead_status_events`                   | `(user_id, to_status, created_at)`, `(lead_id, created_at)`                                                                                                                                                      | Gravada só pelo gatilho `leads_track_status` (`SECURITY DEFINER`); `backfilled` marca eventos estimados       |
| `interactions`                         | `(lead_id, created_at)`                                                                                                                                                                                          | RLS exige que o lead pertença ao usuário                                                                      |
| `collections` / `collection_leads`     | `unique(user_id, name)`, PK `(collection_id, lead_id)`                                                                                                                                                           | RLS exige coleção **e** lead do usuário                                                                       |
| `api_integrations`                     | `(user_id, created_at)`                                                                                                                                                                                          | Segredo em `secret_ciphertext` (`v1:iv:ct`, AES-256-GCM). `header_value` é legado e é migrado no primeiro uso |
| `user_settings`                        | PK `user_id`                                                                                                                                                                                                     | UF e cidade padrão, `providers` (JSON liga/desliga), guia dispensado                                          |
| `rate_limit_hits`, `provider_throttle` | —                                                                                                                                                                                                                | Sem acesso pelo app; usadas só por funções `SECURITY DEFINER`                                                 |

\* Se já houver CNPJs duplicados, a migration cria um índice não único (sem falhar), e a aplicação continua deduplicando.

**Funções**

- `lead_dashboard(p_weeks)`: `SECURITY INVOKER`; agrega totais, status, origem, cidades e ganhos por semana do próprio usuário.
- `consume_rate_limit(bucket, max, janela)`: limite por usuário. Buckets e limites são restritos, para que chamadas diretas não inchem a tabela.
- `acquire_provider_slot(provider, intervalo)`: fila global (todos os usuários) para respeitar a política de 1 req/s do Nominatim. Retorna `-1` se a fila passar de 5 s.

**Integridade**: as `CHECK` novas (status, UF, CNPJ numérico ou alfanumérico, coordenadas, tamanhos) e as FKs para `auth.users` foram criadas como `NOT VALID`. Elas valem para novas escritas, e as linhas legadas fora da regra são preservadas.

**Migrations**: aditivas e idempotentes. O teste `src/test/migrations.test.ts` aplica tudo num Postgres em memória (PGlite), reaplica (idempotência), testa um banco legado com dados inválidos e executa o rollback.

## Segurança

| Risco                           | Mitigação                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSRF via APIs personalizadas    | `net-guard.ts`: somente https (http opcional), sem credenciais na URL, sem hosts internos (`localhost`, `.local`, `.internal`, metadata), sem IPs privados, loopback, link-local, CGNAT ou mapeados v4/v6, e só portas padrão. `safe-fetch.server.ts`: resolução DNS via DoH (bloqueia domínios que apontam para IP interno), `redirect: "manual"` com revalidação a cada salto (máx. 3), timeout e limite de tamanho da resposta |
| Vazamento de chaves de API      | Criptografia AES-256-GCM no servidor (`INTEGRATIONS_ENCRYPTION_KEY`); CRUD só por server functions; o navegador recebe apenas `has_secret`; o eco da chave na resposta de teste é mascarado                                                                                                                                                                                                                                       |
| Chave administrativa no cliente | O app não usa `service_role`; o cliente recusa chaves `sb_secret_*` ou JWT com `role=service_role`; helpers administrativos não usados foram removidos                                                                                                                                                                                                                                                                            |
| Isolamento entre usuários       | RLS por operação; `user_id` imutável (gatilho); FKs filhas validam a posse do pai; `anon` sem permissões                                                                                                                                                                                                                                                                                                                          |
| Abuso e custos                  | Rate limit no Postgres (busca, CNPJ, teste de integração, escrita); cadência global no Nominatim; cache de 10 min para Overpass e Nominatim; espelhos Overpass em sequência (hedging), não em paralelo; lotes de no máximo 500 itens por chamada; arquivos de até 10 MB e 10 mil linhas                                                                                                                                           |
| XSS                             | React escapa o texto; links externos passam por `safeHref` (só http(s)); `rel="noopener noreferrer nofollow"`                                                                                                                                                                                                                                                                                                                     |
| Injeção de fórmulas (CSV/Excel) | `safeCell` prefixa `'` em valores iniciados por `= + - @`                                                                                                                                                                                                                                                                                                                                                                         |
| Injeção em filtros PostgREST    | `ilikeTerm` remove `, ( ) " \` e escapa `% _`                                                                                                                                                                                                                                                                                                                                                                                     |
| CSRF                            | `createCsrfMiddleware` nas server functions; autenticação por header `Authorization` (não por cookie)                                                                                                                                                                                                                                                                                                                             |
| Open redirect                   | `?redirect=` no login aceita só caminhos relativos do próprio site                                                                                                                                                                                                                                                                                                                                                                |
| Mensagens internas              | `runSafely` registra o erro no servidor e devolve só mensagens seguras; `userMessage` traduz erros do Postgres, do Zod e da rede                                                                                                                                                                                                                                                                                                  |
| Enumeração de contas            | Recuperação de senha responde igual com ou sem conta existente                                                                                                                                                                                                                                                                                                                                                                    |
| Senhas                          | Mínimo de 8 caracteres com letras e números; troca exige a senha atual (reautenticação) e encerra outras sessões                                                                                                                                                                                                                                                                                                                  |
| Prototype pollution             | `extractItems` rejeita `__proto__`, `constructor` e `prototype` em `results_path`; SheetJS 0.20.3 (corrige CVE-2023-30533 e a ReDoS)                                                                                                                                                                                                                                                                                              |

## Busca

1. O navegador chama `searchOsm` e `searchIntegrations` **em paralelo**. Os resultados de cada um aparecem assim que chegam, junto com o status de cada fonte, e o usuário pode cancelar (`AbortSignal`).
2. `searchOsm`:
   - **UF**: com cidade, primeiro obtém o _bounding box_ pelo Nominatim (com cache de 24 h). Depois consulta o **Overpass**: um espelho por vez; o próximo só começa após `OVERPASS_HEDGE_DELAY_MS` ou se o anterior falhar; o primeiro sucesso cancela os demais.
   - Se o Overpass falhar ou trouxer poucos resultados (< 20), recorre ao **Nominatim** em busca textual.
   - **Brasil inteiro**: só Nominatim (uma consulta nacional no Overpass seria pesada demais para servidores gratuitos).
3. `mergeDuplicates` junta os resultados entre fontes: mesmo `source_id`, mesmo CNPJ, ou mesmo nome a até 120 m (ou mesmo nome, cidade e endereço quando não há coordenadas). Filiais de uma rede são mantidas, e campos vazios são completados com dados de outras fontes.
4. `saveLeads` (servidor) repete a deduplicação contra o banco (consultas indexadas por `source_id`, `cnpj` e `name_key`), insere em lotes de 100 e trata conflitos de corrida.

### Sessão de busca (navegação e recarga)

`src/lib/search-store.ts` guarda a busca **fora da árvore React** (store com `useSyncExternalStore`). A busca continua quando o usuário troca de página, e o progresso e os resultados aparecem ao voltar. Regras:

- A mesma busca já em andamento é ignorada, sem requisição duplicada. Uma busca diferente cancela a anterior, e respostas atrasadas (de `runId` antigo) são descartadas.
- Uma busca idêntica concluída sem erros há menos de 10 min é reaproveitada sem chamar os provedores. O botão "Buscar de novo" força a consulta.
- Filtros, resultados, página, seleção e itens salvos são espelhados no `sessionStorage`. Depois de um F5, os resultados voltam; uma requisição que estava em voo aparece como "interrompida", porque o navegador a encerrou. A sessão é apagada no logout.
- O cronômetro fica dentro de `ProviderProgress`, então a lista e o mapa não renderizam de novo a cada segundo.
- Resultados **não** são gravados automaticamente. Só "Salvar" ou "Adicionar à coleção" (ação explícita) chamam `saveLeads`, que deduplica no servidor e devolve `source_id → id`.

### Cancelamento

Cancelar a busca aborta a requisição no navegador. No servidor, `requestSignal()` (em `search.functions.ts`) pega o `AbortSignal` da requisição HTTP e o repassa ao Overpass, ao Nominatim (inclusive à espera pela vaga de 1 req/s) e às APIs próprias. Assim os espelhos públicos param de trabalhar quando ninguém vai ler a resposta.

## Cabeçalhos HTTP de segurança

`src/lib/security-headers.ts`, aplicado em `src/server.ts` a toda resposta do servidor (HTML e server functions):

| Cabeçalho                                 | Valor                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Content-Security-Policy` (só produção)   | `default-src 'self'`; scripts só do próprio site (+ inline do tema e da hidratação); `connect-src` limitado ao site, ao Supabase (https/wss) e ao OpenFreeMap; `frame-ancestors 'none'`; `object-src 'none'` |
| `Strict-Transport-Security` (só produção) | 1 ano, com subdomínios                                                                                                                                                                                       |
| `X-Frame-Options`                         | `DENY`                                                                                                                                                                                                       |
| `X-Content-Type-Options`                  | `nosniff`                                                                                                                                                                                                    |
| `Referrer-Policy`                         | `strict-origin-when-cross-origin`                                                                                                                                                                            |
| `Permissions-Policy`                      | câmera, microfone, geolocalização, pagamento e USB desativados                                                                                                                                               |
| `Cross-Origin-Opener-Policy`              | `same-origin`                                                                                                                                                                                                |

Em desenvolvimento a CSP fica desligada, porque o HMR do Vite usa código inline. **Se adicionar um serviço chamado pelo navegador** (outro mapa, analytics etc.), inclua a origem dele em `connect-src`/`img-src`, ou a CSP vai bloqueá-lo.

## Adicionando um provedor

1. `src/lib/server/providers/<nome>.server.ts`: use `providerFetch` (timeout e limite de tamanho) e, se a API for gratuita, `waitProviderSlot`.
2. Faça o _parser_ puro em `src/lib/`, normalizando com `normalize.ts` e retornando `DiscoveredLead`.
3. Chame o provedor em `search.functions.ts` (ou crie uma server function própria para resultados progressivos) e devolva um `ProviderStatus`.
4. Adicione as variáveis em `env.server.ts` e `.env.example`, a chave de liga/desliga em `user_settings.providers` e a linha em Configurações.
5. Escreva testes com `fetch` mockado, como em `src/test/providers.test.ts`.

## Frontend e UX

- **Layout**: sidebar recolhível (preferência salva no navegador), menu mobile em _Sheet_ com foco preso e Esc, link "Pular para o conteúdo", `scrollbar-gutter: stable` (sem saltos), `100dvh`.
- **Movimento**: transição de página `animate-page-in` (260 ms), `animate-pop-in`, hover com elevação (`card-interactive`) e pressão em botões. Tudo é desligado por `prefers-reduced-motion`.
- **Estados**: skeletons em todas as listas, estados vazios com ação, toasts de sucesso e erro, barra de ações em lote flutuante com espaçador (não cobre conteúdo).
- **Tema**: claro, escuro ou sistema, aplicado antes da pintura (sem "flash"); o mapa troca de estilo junto.
- **Gráfico**: coluna única com cor validada (contraste ≥ 3:1 nos dois temas), tooltip por hover ou foco e alternância para tabela.
- **Code splitting**: rotas, mapa, SheetJS e PapaParse são carregados sob demanda.
