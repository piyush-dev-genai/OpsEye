import type { AppConfig } from "@opseye/config";
import { getTopic, type KafkaProducerHandle } from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { KafkaTopic, QueryRequest } from "@opseye/types";

export interface SubmitQueryInput {
  readonly requestId: string;
  readonly queryRequest: QueryRequest;
}

export interface SubmitQueryResult {
  readonly topic: KafkaTopic;
  readonly queryId: string;
}

export class QueryOrchestratorService {
  private readonly topic: KafkaTopic;

  public constructor(
    private readonly producer: KafkaProducerHandle,
    private readonly logger: AppLogger,
    appConfig: AppConfig,
  ) {
    this.topic = getTopic("queryRequested", appConfig);
  }

  public async submitQuery(
    input: SubmitQueryInput,
  ): Promise<SubmitQueryResult> {
    await this.producer.publishMessage({
      topic: this.topic,
      key: input.queryRequest.id,
      payload: input.queryRequest,
      headers: {
        "x-request-id": input.requestId,
      },
    });

    this.logger.info("Published query request.", {
      requestId: input.requestId,
      queryId: input.queryRequest.id,
      topic: this.topic,
    });

    return {
      topic: this.topic,
      queryId: input.queryRequest.id,
    };
  }
}
