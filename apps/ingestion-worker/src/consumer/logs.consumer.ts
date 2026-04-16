import type { AppConfig } from "@opseye/config";
import {
  createConsumer,
  getTopic,
  type KafkaConsumerHandle,
} from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { KafkaEnvelope, RawLogEvent } from "@opseye/types";

import { chunkLogs } from "../pipeline/chunk.step";
import { embedChunks } from "../pipeline/embed.step";
import { enrichLogs } from "../pipeline/enrich.step";
import { indexChunks } from "../pipeline/index.step";
import { normalizeLogs } from "../pipeline/normalize.step";
import type { IndexingService } from "../services/indexing.service";

export interface LogsConsumerDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
  readonly indexingService: IndexingService;
}

export interface LogsConsumerHandle {
  readonly consumer: KafkaConsumerHandle;
  start(): Promise<void>;
  disconnect(): Promise<void>;
}

async function processLogBatch(
  envelopes: readonly KafkaEnvelope<RawLogEvent>[],
  dependencies: LogsConsumerDependencies,
): Promise<void> {
  const logs = envelopes.map((envelope) => envelope.payload);

  if (logs.length === 0) {
    return;
  }

  const normalizedLogs = normalizeLogs(logs);
  const enrichedLogs = enrichLogs(normalizedLogs);
  const chunks = chunkLogs(enrichedLogs, {
    windowMs: 120_000,
    maxLogsPerChunk: 25,
    summaryMinGroupSize: 3,
  });
  const embeddedChunks = await embedChunks(chunks, {
    appConfig: dependencies.appConfig,
  });
  const result = await indexChunks(
    embeddedChunks,
    dependencies.indexingService,
  );

  dependencies.logger.info("Processed raw log batch.", {
    batchSize: logs.length,
    normalizedCount: normalizedLogs.length,
    chunkCount: chunks.length,
    rawChunkCount: normalizedLogs.length,
    indexedCount: result.indexedCount,
    dimensions: result.dimensions,
  });
}

export function createLogsConsumer(
  dependencies: LogsConsumerDependencies,
): LogsConsumerHandle {
  const consumer = createConsumer({
    appConfig: dependencies.appConfig,
    consumerConfig: {
      groupIdSuffix: "ingestion-worker",
    },
  });

  return {
    consumer,
    start: async (): Promise<void> => {
      const topic = getTopic("logsRaw", dependencies.appConfig);

      await consumer.connect();
      await consumer.subscribe({ topic });
      await consumer.run<RawLogEvent>({
        eachBatch: async ({ envelopes }) => {
          await processLogBatch(envelopes, dependencies);
        },
      });

      dependencies.logger.info("Started logs consumer.", {
        topic,
      });
    },
    disconnect: async (): Promise<void> => {
      await consumer.disconnect();
    },
  };
}
