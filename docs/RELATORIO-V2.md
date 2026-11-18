# LeadHunter v2: relatório de entrega

Data: 17/11/2026 · Branch: `refactor/leadhunter-v2`

Ordem de execução seguida: segurança → banco → buscas → funcionalidades → UX → qualidade → Supabase próprio e documentação → validação integrada.

## 1. Melhorias implementadas

### Segurança e autenticação

- **SSRF**: URLs das APIs personalizadas passam por validação de esquema (só https), porta, credenciais na URL, nomes internos e IPs privados/loopback/link-local/metadata/CGNAT/IPv6 mapeado. A resolução DNS via DoH bloqueia domínios que apontam para IPs internos. Redirecionamentos são revalidados a cada salto (máx. 3), com timeout de 15 s e resposta de no máximo 2 MB. Arquivos: `src/lib/net-guard.ts` e `src/lib/server/safe-fetch.server.ts`.
- **Chaves de API**: criptografadas com AES-256-GCM no servidor (`INTEGRATIONS_ENCRYPTION_KEY`). Todo o CRUD de integrações passou para server functions; o navegador recebe só `has_secret`. Chaves legadas em texto puro são migradas no primeiro uso, e o eco da chave na resposta de teste é mascarado.
- **Nenhuma chave administrativa**: o app não usa `service_role`. Os helpers não usados (`client.server.ts`, `cron-auth.ts`) foram removidos, e o cliente recusa iniciar se uma chave secreta for configurada como pública.
- **SheetJS 0.20.3** (CDN oficial) no lugar do `xlsx` 0.18.5 vulnerável. **Zod 4.6.7** e **Vite 8.1.7** corrigem os avisos de auditoria.
- **RLS reforçada**: políticas por operação. `interactions` e `collection_leads` agora exigem que o lead e a coleção referenciados sejam do próprio usuário. `user_id` é imutável, o papel `anon` não tem nenhuma permissão e foram criadas FKs para `auth.users`.
- **Rate limiting no Postgres** (busca, CNPJ, teste de integração e escrita), fila global de 1 req/s para o Nominatim, limite de lotes (500) e de arquivos (10 MB / 10 mil linhas).
- **Senha**: troca exige a senha atual (reautenticação real) e encerra as outras sessões. A recuperação valida o link e não revela se o e-mail existe. Política mínima: 8 caracteres com letras e números.
- **Google OAuth** direto no Supabase próprio; o intermediário `@lovable.dev/cloud-auth-js` foi removido.
- Proteção contra **open redirect** no `?redirect=`, contra **injeção de fórmulas** em CSV/Excel, contra **injeção em filtros PostgREST** e contra **prototype pollution** no `results_path`. Links externos só são renderizados se forem http(s).
- **Erros padronizados**: o servidor registra os detalhes no log e o usuário vê só mensagens seguras em pt-BR (`src/lib/errors.ts`).

### Banco de dados e migrations

- Migrations versionadas em `supabase/migrations/` (Supabase CLI) e espelhadas em `drizzle/migrations/0002` para o Lovable Cloud continuar funcionando até a troca.
- **Decisão sobre o Drizzle ORM**: não foi adotado como ORM. O app inteiro usa supabase-js sob RLS, e um ORM no servidor exigiria conexão direta ao banco, contornando o RLS. O Drizzle continua só como mecanismo de migration do Lovable.
- Novas estruturas: `lead_status_events` (histórico com _backfill_ marcado como estimado), `user_settings`, `rate_limit_hits` e `provider_throttle`. Novas colunas: `whatsapp`, `linkedin`, `status_changed_at` e `name_key` (gerada), além de `secret_ciphertext`/`updated_at` em integrações e `updated_at` em coleções.
- Índices para listagem, busca por nome, cidade, CNPJ, Kanban e histórico.
- Restrições `NOT VALID` (status, UF, CNPJ numérico **e alfanumérico**, coordenadas e tamanhos) que preservam linhas legadas. O índice único de CNPJ tem fallback automático se já houver duplicados.
- Funções: `lead_dashboard` (agregação no servidor), `consume_rate_limit` e `acquire_provider_slot`.
- **Rollback** manual documentado em `supabase/rollback/`.

### Busca

- Resultados **progressivos**: OSM e APIs próprias rodam em paralelo, com **status por fonte**, barra de progresso, tempo decorrido e **cancelamento**.
- **Overpass com hedging**: um espelho por vez; o próximo só após 6 s ou falha; o primeiro sucesso **cancela** os demais. Cache de 10 min.
- **Nominatim** como complemento e fallback. Consultas reformuladas: frase de categoria OSM ("bakery in Campinas") e depois texto simples. A versão anterior ("padaria em Campinas, São Paulo") não retornava nada.
- Busca nacional ("Todo o Brasil"), filtrada por UF via código ISO.
- **Deduplicação** por ID da fonte, CNPJ ou mesmo nome a até 120 m. Filiais de redes são mantidas e campos vazios são completados entre fontes.
- Normalização de telefones (+55 DD), sites, e-mails, Instagram, Facebook, LinkedIn e WhatsApp; CNPJ só entra com dígitos verificadores válidos.
- **Guia de busca**: faixa de 4 passos que pode ser fechada (a preferência é lembrada) e painel lateral completo; sugestões de segmento.

### Leads, Kanban, coleções e dashboard

- **Meus leads**: paginação, filtros e ordenação no servidor, com estado na URL; ações em lote (status, coleção, excluir); criação manual com detecção de duplicado.
- **Detalhe**: seções organizadas, contatos clicáveis, enriquecimento por CNPJ (só preenche campos vazios), linha do tempo de interações e mudanças de status, coleções do lead.
- **Kanban**: dnd-kit com mouse, **toque (segurar)** e **teclado**; soltura pelo ponteiro; menu "Mover para"; atualização otimista com **reversão**; "Carregar mais" por coluna; histórico gravado pelo banco.
- **Coleções**: interface completa (CRUD, adicionar e remover em lote, detalhe paginado).
- **Dashboard**: agregado no servidor, com ganhos por semana (métrica estrela-guia), conversão (ganhos ÷ encerrados), funil clicável, cidades, origem e qualidade dos contatos. O gráfico tem cor validada, tooltip e alternância para tabela.
- **Importar/Exportar**: validação por linha antes do envio, mapeamento sem colunas duplicadas, lotes com progresso, relatório e download das linhas com erro. A exportação busca **todos** os leads em páginas de 1000; a versão anterior parava silenciosamente em 1000.

### Layout e UX

Sidebar recolhível, menu mobile acessível, tema claro/escuro/sistema sem "flash", transições e microinterações discretas (desligadas com `prefers-reduced-motion`), skeletons, estados vazios com ação, barra de ações em lote flutuante que não cobre conteúdo, foco visível, link "pular para o conteúdo", tabelas que viram cartões no celular e mapa que acompanha o tema.

### Qualidade

- `.gitattributes` (LF), Prettier aplicado, **ESLint com 0 problemas** e **TypeScript sem erros**.
- 27 componentes shadcn sem uso e 24 dependências removidas.
- _Code splitting_ do mapa, do SheetJS e do PapaParse.
- 84 testes automatizados.

## 2. Testes executados e resultados

Todos os comandos abaixo foram **executados** nesta entrega, em Windows 11, Node 24.19.

| Verificação                     | Comando                                   | Resultado                                                                                                    |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TypeScript                      | `npx tsc --noEmit`                        | ✅ sem erros                                                                                                 |
| ESLint + Prettier               | `npx eslint .` / `npx prettier --check .` | ✅ 0 problemas / todos formatados                                                                            |
| Testes automatizados            | `npx vitest run`                          | ✅ **84/84** em 6 arquivos                                                                                   |
| Build de produção               | `npx vite build`                          | ✅ ok                                                                                                        |
| Auditoria (produção)            | `npm audit --omit=dev`                    | ✅ **0 vulnerabilidades**                                                                                    |
| Auditoria (dev)                 | `npm audit`                               | ⚠️ 4 moderadas no `drizzle-kit` → `esbuild` antigo (só ferramenta de migration do Lovable; não entra no app) |
| Migrations em banco limpo       | Supabase CLI local (`supabase start`)     | ✅ as 2 migrations aplicadas sem erro                                                                        |
| Segredos no bundle do navegador | busca no `.output/public`                 | ✅ nenhum segredo                                                                                            |

**Testes automatizados (Vitest)**

- `migrations.test.ts` (Postgres 17 real em memória via PGlite): aplicação em banco limpo, **idempotência**, histórico de status, restrições, **isolamento entre usuários** (leitura, alteração, referência a dados alheios, falsificação de `user_id`, acesso anônimo), rate limit, fila de provedor, migração de **banco legado** com dados inválidos (nada perdido, `updated_at` preservado) e **rollback** seguido de nova aplicação.
- `security.test.ts`: 21 URLs maliciosas bloqueadas (SSRF), redirecionamento para metadata, limite de tamanho, DNS para IP privado, criptografia (ida e volta, IV único, chave errada, chave ausente), prototype pollution, fórmulas, `javascript:` em links, escape de filtros e mensagens de erro.
- `domain.test.ts`: CNPJ numérico e alfanumérico, normalização de contatos (pegou e corrigiu um bug real com números 0800), deduplicação (filiais, entre fontes, sem coordenadas), importação, provedores, schemas e política de senha.
- `providers.test.ts`: hedging do Overpass (um espelho por vez, cancelamento do lento, cache, falha total) e fallback do rate limit.

**Teste de ponta a ponta (E2E)**: **20/20**, com 0 erros de console

App real (`npm run dev`) e Supabase real local (Docker: Postgres, Auth e Mailpit), dirigidos pelo Microsoft Edge (Playwright), com dois usuários:

1. Login com e-mail e senha
2. Busca **real** no OpenStreetMap (Campinas/SP, padaria): 40 resultados do Overpass em 28 s, com status por fonte
3. Salvar 3 leads; salvar de novo não duplica (3 leads e 3 eventos de status no banco)
4. Meus leads: criação manual, telefone normalizado, duplicado detectado, busca no servidor
5. Detalhe: interação registrada e linha do tempo
6. Kanban: arrastar com mouse (Novo → Em contato) grava o histórico `null→novo ; novo→contato`
7. Kanban: mover pelo menu para Ganho
8. Dashboard agregado com o ganho na semana
9. Coleções: criar e adicionar 4 leads em lote; detalhe correto
10. Importar CSV: 2 importados, 1 duplicado, 2 inválidos (CNPJ e status)
11. Exportar CSV: fórmula `=2+3` neutralizada, sem `user_id`
12. Integração com URL de metadata (169.254.169.254) e `http://localhost` bloqueadas
13. Integração real (jsonplaceholder): chave salva como `v1:…` (sem texto puro no banco, no DOM ou na resposta); teste reconheceu 10 leads
14. Busca com API própria em paralelo: JSONPlaceholder 10, Overpass 2 e Nominatim 1 (fallback ativo)
15. Rate limit: mensagem amigável ao exceder
16. Troca de senha: senha atual errada é recusada; com a correta, a troca funciona
17. Recuperação por e-mail: link no Mailpit → `/reset-password` → nova senha válida
18. Usuário B: não vê leads nem coleções de A; URL de lead de A mostra "não encontrado"; inserir interação em lead de A → **HTTP 403**; alterar lead de A → 0 linhas; anônimo → **HTTP 401**
19. Celular (390×844 reais): dashboard, busca, leads e coleções **sem rolagem horizontal**; menu mobile
20. Tema escuro: dashboard, leads e Kanban

Problemas encontrados **pelos testes** e corrigidos: números 0800 formatados como DDD; worker da MapLibre falhando no modo dev (mapa sem fundo); Kanban soltando o card na coluna com maior sobreposição em vez de sob o ponteiro; consulta do Nominatim que nunca retornava resultados; pluralização no dashboard.

## 3. Limitações e o que depende de você

- **Google OAuth** não foi testado de ponta a ponta: exige credenciais do Google Cloud. O botão e o fluxo usam a API padrão do Supabase (passo 12 do `SUPABASE_SETUP.md`).
- **SMTP de produção**: os e-mails foram validados no Mailpit local. Em produção, configure um SMTP próprio.
- **Arrastar por toque** no Kanban usa o sensor de toque do dnd-kit (pressionar e segurar). O teste automatizado cobriu mouse e o menu "Mover para"; o toque real deve ser conferido num celular.
- **Provedores públicos** (Overpass e Nominatim) variam de disponibilidade: em uma das rodadas os espelhos do Overpass não responderam em 60 s. O app mostra a falha por fonte e usa o fallback.
- **Deploy pelo Lovable**: enquanto o projeto estiver ligado ao Lovable Cloud, o deploy feito pelo Lovable usa o banco do Lovable Cloud. A migration v2 também foi colocada em `drizzle/migrations/0002_v2_hardening.sql` para o Lovable aplicá-la. Para usar o Supabase próprio em produção, veja o Anexo B do `SUPABASE_SETUP.md`.
- **Dados do Lovable Cloud** não foram migrados nem apagados. O procedimento está no Anexo A do `SUPABASE_SETUP.md`; as contas de usuário precisam ser recriadas.
- A regra de **conversão** do dashboard mudou de "ganhos ÷ total" para "ganhos ÷ (ganhos + perdidos)", o padrão comercial. A explicação aparece no próprio card.
