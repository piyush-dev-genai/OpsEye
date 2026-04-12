import type { AppConfig } from "@opseye/config";
import { getTopic, type KafkaProducerHandle } from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { KafkaTopic, RawLogEvent } from "@opseye/types";

export interface PublishLogsInput {
  readonly requestId: string;
  readonly logs: readonly RawLogEvent[];
}

export interface PublishLogsResult {
  readonly topic: KafkaTopic;
  readonly publishedCount: number;
}

export class IngestPublisherService {
  private readonly topic: KafkaTopic;

  public constructor(
    private readonly producer: KafkaProducerHandle,
    private readonly logger: AppLogger,
    appConfig: AppConfig,
  ) {
    this.topic = getTopic("logsRaw", appConfig);
  }

  public async publishLogs(
    input: PublishLogsInput,
  ): Promise<PublishLogsResult> {
    for (const [index, log] of input.logs.entries()) {
      const key =
        log.traceId !== undefined && log.traceId.length > 0
          ? log.traceId
          : `${input.requestId}:${index}`;

      await this.producer.publishMessage({
        topic: this.topic,
        key,
        payload: log,
        headers: {
          "x-request-id": input.requestId,
          "x-log-index": index.toString(),
        },
      });
    }

    this.logger.info("Published raw log events.", {
      requestId: input.requestId,
      topic: this.topic,
      publishedCount: input.logs.length,
    });

    return {
      topic: this.topic,
      publishedCount: input.logs.length,
    };
  }
}
