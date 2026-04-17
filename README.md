# OpsEye

OpsEye is a local-development MVP for an AI incident copilot. The stack is a TypeScript npm-workspaces monorepo with three deployable apps:

- `apps/api`
- `apps/ingestion-worker`
- `apps/query-worker`

This repo includes local Docker infrastructure for:

- Kafka
- Redis
- API
- ingestion-worker
- query-worker

## Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Fill in the required LLM settings in `.env`:

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_CHAT_MODEL`
- `LLM_EMBEDDING_MODEL`
- `LLM_MODEL` only as a backward-compatible fallback if one model or deployment is used for both
- `LLM_API_VERSION` only if your provider requires it

3. Start the local stack from the repo root:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up --build
```

4. Verify the API is reachable:

```bash
curl http://localhost:3000/health
```

## Env Configuration

Important local variables:

- `API_PORT`: host and container port exposed by the API
- `LOG_LEVEL`: set to `debug` if you want the generated query answer to appear in `query-worker` logs
- `KAFKA_BROKERS`: inside compose this should stay `kafka:9092`
- `VECTOR_STORE_URL`: inside compose this should stay `redis://redis:6379`
- `VECTOR_STORE_INDEX`: Redis vector index name used by ingestion and query workers
- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_CHAT_MODEL`, `LLM_EMBEDDING_MODEL`, `LLM_API_VERSION`: provider settings used by answer generation and embeddings

The provided `.env.example` is already wired for container-to-container communication through the compose service names.

Azure OpenAI example:

```env
LLM_API_KEY=your-azure-openai-key
LLM_BASE_URL=https://your-resource.openai.azure.com
LLM_API_VERSION=2024-10-21
LLM_CHAT_MODEL=your-chat-deployment
LLM_EMBEDDING_MODEL=your-embedding-deployment
```

## Start And Stop

Start:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up --build
```

Run in the background:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up --build -d
```

Stop:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

Stop and remove local Kafka/Redis data:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml down -v
```

## Sample Ingest Request

Send a small batch of logs to the API:

```bash
curl -X POST http://localhost:3000/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "logs": [
      {
        "message": "checkout-api latency increased after database pool saturation",
        "timestamp": "2026-04-17T10:00:00Z",
        "service": "checkout-api",
        "environment": "production",
        "level": "error",
        "traceId": "trace-checkout-001",
        "source": "app",
        "attributes": {
          "region": "ap-south-1",
          "dbHost": "orders-primary"
        }
      },
      {
        "message": "database connection timeout while fetching order summary",
        "timestamp": "2026-04-17T10:00:15Z",
        "service": "checkout-api",
        "environment": "production",
        "level": "error",
        "traceId": "trace-checkout-001",
        "source": "app",
        "attributes": {
          "region": "ap-south-1",
          "timeoutMs": 3000
        }
      },
      {
        "message": "retry succeeded after pool recovered",
        "timestamp": "2026-04-17T10:01:10Z",
        "service": "checkout-api",
        "environment": "production",
        "level": "warn",
        "traceId": "trace-checkout-001",
        "source": "app"
      }
    ]
  }'
```

Expected API behavior:

- HTTP `202 Accepted`
- response includes `requestId`, `status`, `topic`, and `acceptedCount`

## Sample Query Request

After the ingest request has been accepted and processed by `ingestion-worker`, submit a query:

```bash
curl -X POST http://localhost:3000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "What is the likely root cause of the checkout-api incident?",
    "filters": {
      "service": "checkout-api",
      "environment": "production",
      "fromTimestamp": "2026-04-17T09:55:00Z",
      "toTimestamp": "2026-04-17T10:05:00Z",
      "traceId": "trace-checkout-001"
    }
  }'
```

Expected API behavior:

- HTTP `202 Accepted`
- response includes `requestId`, `queryId`, `status`, and `topic`

The query is processed asynchronously. The API does not return the RCA answer directly yet.

## Verify The Generated Answer In Logs

For now, the generated answer is visible from `query-worker` logs when `LOG_LEVEL=debug`.

Follow the worker logs:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml logs -f query-worker
```

Useful checks:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml logs --since 5m ingestion-worker
docker compose --env-file .env -f infra/compose/docker-compose.yml logs --since 5m query-worker
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

What to look for in `query-worker` logs:

- `Processing query request.`
- `Embedded query.`
- `Retrieved candidate chunks for query.`
- `Reranked retrieved chunks.`
- `Built compact query context.`
- `Generated grounded RCA answer.`
- `Generated grounded query answer.`

The final debug log includes the answer text and citations for the accepted `queryId`.

## Notes

Assumptions:

- Docker and Docker Compose v2 are installed locally
- your LLM provider credentials are valid
- the configured provider supports the OpenAI-compatible `/chat/completions` and `/embeddings` APIs used by this MVP

Reused scripts and commands:

- Docker images build the repo with the existing root script: `npm run build`
- runtime entrypoints use the existing compiled Node outputs in each app's `dist` directory

Local limitations:

- this stack is for local development only
- Kafka topics are auto-created by the local broker configuration
- the query answer is not persisted or returned by the API yet; verification is through `query-worker` logs
- there is no hot-reload container workflow yet; source changes require rebuilding the images
