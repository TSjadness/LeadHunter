# LeadHunter

Plataforma de prospecção B2B para negócios locais no Brasil. Encontre empresas reais por **segmento, estado e cidade**, salve-as como leads, acompanhe o funil no **Kanban**, organize em **coleções**, enriqueça pelo **CNPJ** e importe ou exporte planilhas, sem contatos inventados.

> Banco de dados e autenticação: Supabase (projeto **Hunter**). Para configurar um Supabase do zero, siga o [**SUPABASE_SETUP.md**](SUPABASE_SETUP.md).

## Funcionalidades

| Área                  | O que faz                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pesquisa**          | OpenStreetMap (Overpass + Nominatim) e suas APIs, com resultados progressivos, status por fonte, cancelamento, busca que continua ao trocar de página, "Adicionar à coleção" direto nos resultados, filtros de contato (telefone, site, e-mail, redes), mapa e guia de busca |
| **Meus leads**        | Paginação, busca, filtros e ordenação no servidor; filtro e ordenação por prioridade; ações em lote (status, prioridade, coleção, excluir); criação manual                                                                                                                   |
| **Detalhe do lead**   | Edição validada, enriquecimento por CNPJ (BrasilAPI, inclusive CNPJ alfanumérico), linha do tempo de interações e mudanças de status                                                                                                                                         |
| **Kanban**            | Arrastar e soltar com mouse, toque (segurar) e teclado; atualização otimista com reversão; carregamento incremental; histórico automático; filtro por coleção; selo de prioridade                                                                                            |
| **Coleções**          | Criar, editar e excluir; adicionar e remover leads; contagem e detalhe                                                                                                                                                                                                       |
| **Dashboard**         | Agregado no servidor: ganhos por semana (métrica estrela-guia), conversão, funil, cidades, origem e qualidade dos contatos                                                                                                                                                   |
| **Importar/Exportar** | Excel, CSV e JSON com mapeamento de colunas, validação por linha, deduplicação, relatório de erros e proteção contra fórmulas maliciosas; coluna "prioridade"                                                                                                                |
| **Integrações**       | APIs próprias com proteção contra SSRF e chave criptografada no servidor                                                                                                                                                                                                     |
| **Conta**             | E-mail e senha, Google, recuperação de senha, troca com reautenticação, tema claro/escuro/sistema (botão no cabeçalho)                                                                                                                                                       |

## Início rápido (Windows + VS Code) — Supabase "Hunter" já configurado

O banco remoto **Hunter** já tem as tabelas, RLS e funções (verificado em 17/11/2026).

> ⚠️ **Antes de rodar esta versão**, aplique no Hunter a migration de prioridade `supabase/migrations/20261118000100_lead_priority.sql` (Supabase → SQL Editor → cole o arquivo → Run, ou `npx supabase db push`). Sem ela, o Kanban e Meus leads mostram erro.

Depois:

```powershell
# Abra a pasta no VS Code → Terminal → Novo terminal (PowerShell)
npm install
# Copy-Item .env.example .env  →  preencha:  VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
# INTEGRATIONS_ENCRYPTION_KEY e PROVIDER_CONTACT_EMAIL. Veja .env.example.
npm run dev                         # http://localhost:8080
```

- Extensões recomendadas: ESLint, Prettier, Tailwind CSS IntelliSense.
- Se o PowerShell bloquear o `npm` ("execução de scripts desabilitada"): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- Antes de entregar alterações: `npm run check` e `npm run build`.

## Início rápido (Windows) — Supabase novo

```powershell
# 📁 pasta do projeto, no terminal do VS Code (PowerShell)
npm install
Copy-Item .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npx supabase link --project-ref <project-ref>
npx supabase db push                # cria tabelas, RLS e funções no seu Supabase
npm run dev                         # http://localhost:8080
```

O passo a passo completo, com criação do projeto, Auth, Google OAuth e diagnóstico, está em **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)**.

## Scripts

| Comando             | Descrição                                                                      |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`       | Frontend e server functions em modo desenvolvimento (porta 8080)               |
| `npm run build`     | Build de produção (Cloudflare Worker em `.output/`)                            |
| `npm run preview`   | Serve o build localmente                                                       |
| `npm run typecheck` | TypeScript (`tsc --noEmit`)                                                    |
| `npm run lint`      | ESLint + Prettier                                                              |
| `npm run format`    | Formata o código com Prettier                                                  |
| `npm test`          | Testes automatizados (Vitest; inclui migrations + RLS num Postgres em memória) |
| `npm run check`     | Typecheck, lint e testes                                                       |

## Tecnologias

React 19 · TanStack Start/Router/Query · Tailwind CSS 4 · Radix UI (shadcn) · Supabase (Postgres + Auth + RLS) · Zod 4 · MapLibre + OpenFreeMap · dnd-kit · SheetJS 0.20.3 (sob demanda) · PapaParse · Vitest + PGlite.

## Documentação

- [SUPABASE_SETUP.md](SUPABASE_SETUP.md): configuração do banco e da autenticação do zero
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitetura, segurança, banco e integrações
- [docs/RELATORIO-V2.md](docs/RELATORIO-V2.md): melhorias implementadas, testes realizados e limitações
- [docs/ESTRELA-GUIA.md](docs/ESTRELA-GUIA.md): objetivo do produto e métrica principal
- [docs/RELATORIO-V2.1.md](docs/RELATORIO-V2.1.md): rodada de 17/11/2026 (layout da pesquisa, tema, coleções na pesquisa, filtro no Kanban, busca persistente)
- [.env.example](.env.example): todas as variáveis de ambiente, explicadas

## Dados e licenças

Dados de empresas © colaboradores do OpenStreetMap, licença [ODbL](https://opendatacommons.org/licenses/odbl/). Mapas: OpenFreeMap. CNPJ: BrasilAPI (dados públicos da Receita Federal). Campos que a fonte não informa ficam como "Não verificado na fonte": o LeadHunter nunca inventa contatos.
