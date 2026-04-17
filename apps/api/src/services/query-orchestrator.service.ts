import type { AppConfig } from "@opseye/config";
import { getTopic, type KafkaProducerHandle } from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { KafkaTopic, QueryRequest } from "@opseye/types";
import type { QueryResultRepository } from "@opseye/vector-store";

export interface SubmitQueryInput {
  readonly requestId: string;
  readonly queryRequest: QueryRequest;
}

export interface SubmitQueryResult {
  readonly topic: KafkaTopic;
  readonly queryId: string;
}

const QUERY_SUBMISSION_FAILED_MESSAGE =
  "Query submission failed before execution started.";

export class QueryOrchestratorService {
  private readonly topic: KafkaTopic;

  public constructor(
    private readonly producer: KafkaProducerHandle,
    private readonly queryResultRepository: QueryResultRepository,
    private readonly logger: AppLogger,
    appConfig: AppConfig,
  ) {
    this.topic = getTopic("queryRequested", appConfig);
  }

  public async submitQuery(
    input: SubmitQueryInput,
  ): Promise<SubmitQueryResult> {
    await this.queryResultRepository.createQueued({
      queryRequest: input.queryRequest,
    });

    try {
      await this.producer.publishMessage({
        topic: this.topic,
        key: input.queryRequest.id,
        payload: input.queryRequest,
        headers: {
          "x-request-id": input.requestId,
        },
      });
    } catch (error) {
      await this.queryResultRepository.markFailed(
        input.queryRequest.id,
        QUERY_SUBMISSION_FAILED_MESSAGE,
      );

      throw error;
    }

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
