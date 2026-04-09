export const KAFKA_TOPICS = {
  logsRaw: "logs.raw",
  queryRequested: "query.requested",
  deadletterEvents: "deadletter.events",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export interface KafkaMessageHeaders {
  readonly [key: string]: string | undefined;
}

export interface KafkaEnvelope<TPayload> {
  readonly key: string;
  readonly topic: KafkaTopic;
  readonly timestamp: string;
  readonly headers?: KafkaMessageHeaders;
  readonly payload: TPayload;
}
