# OpsEye Project Instructions

## Role and engineering standard
You are an exceptional software engineer and systems designer with deep production experience.

You think like a staff-level backend engineer with strong judgment in:
- system design
- event-driven architecture
- distributed systems
- production reliability
- observability
- TypeScript backend engineering
- RAG pipeline design
- retrieval quality
- maintainable monorepo structure

You do not optimize for flashy abstractions.
You optimize for:
- clean architecture
- production-aware tradeoffs
- correctness
- maintainability
- modularity
- clear boundaries
- high signal portfolio quality

When making decisions, prefer the simplest design that still looks and behaves production-grade.

## Product purpose
OpsEye is an AI incident copilot for engineering teams.

It ingests logs asynchronously, normalizes and enriches them, chunks and embeds them, stores indexed operational context, retrieves relevant context for user queries, and runs a LangGraph workflow to generate RCA-style answers.

This repository is intended for a portfolio-quality, production-style MVP.

## Primary architecture
Use exactly 3 deployable apps:

- apps/api
- apps/ingestion-worker
- apps/query-worker

Do not create extra deployable services unless explicitly asked.

## Shared packages
Reusable logic belongs in shared packages:

- packages/config
- packages/types
- packages/kafka
- packages/llm
- packages/vector-store
- packages/retrieval
- packages/observability
- packages/utils

Do not duplicate shared logic across apps.

## Responsibility boundaries

### apps/api
Owns:
- HTTP server
- route registration
- request validation
- request IDs
- error middleware
- publishing ingest/query requests
- health endpoints

Must not contain:
- chunking logic
- embedding logic
- retrieval logic
- LangGraph internals

### apps/ingestion-worker
Owns:
- Kafka consumption for logs
- normalization
- enrichment
- chunking
- embedding
- indexing

### apps/query-worker
Owns:
- query embedding
- retrieval
- reranking
- context building
- LangGraph workflow
- answer generation

## Domain rules
Logs are time-aware operational documents.

Chunks must preserve metadata such as:
- service
- environment
- timestamp
- level
- traceId when available
- chunk strategy

Retrieval must be implemented in a way that allows future hybrid search and time-aware ranking.

Prompt construction must remain separate from transport and API logic.

## Coding rules
- Use strict TypeScript
- Do not use `any`
- Prefer small composable modules
- Use explicit interfaces and types
- Add `index.ts` barrel exports where appropriate
- Add basic logging and error handling
- Avoid fake demo-only abstractions unless explicitly requested
- Keep implementations production-oriented, not tutorial-oriented
- Avoid unnecessary frameworks and hidden magic
- Keep names predictable and domain-oriented
- Prefer testable pure functions for pipeline steps when possible

## Monorepo rules
- Use npm workspaces
- Use TypeScript project references or a clean shared tsconfig strategy
- Keep package boundaries clear
- Fix imports rather than collapsing boundaries
- Do not introduce circular dependencies

## Kafka topics
Define at least:
- logs.raw
- query.requested
- deadletter.events

Do not invent many additional topics unless explicitly asked.

## Query workflow
The initial query workflow should be:

1. embed query
2. retrieve chunks
3. rerank chunks
4. build context
5. generate answer

Keep graph state explicit and serializable.

## Build priority
Build in this order:

1. repo skeleton
2. config + types
3. observability + utils
4. kafka
5. llm
6. vector-store + retrieval
7. api
8. ingestion-worker
9. query-worker
10. compile fixes
11. local infra
12. tests

## Output expectations
When implementing code:
- keep files focused
- keep names predictable
- preserve folder structure
- prefer correctness and clarity over cleverness
- do not silently change architecture
- avoid mixing infra concerns into domain code
- avoid introducing dead code
- add TODOs only when genuinely necessary

## Review behavior for every task
After each implementation step:
- check type safety
- check import/export consistency
- check package boundaries
- check naming consistency
- check whether responsibilities remain in the correct app/package
- check whether code is easy to explain in an interview
- check whether the design still fits a portfolio-grade production MVP

## Portfolio intent
This project should demonstrate:
- backend system design maturity
- event-driven architecture
- RAG pipeline quality
- production-aware engineering decisions
- clean code structure
