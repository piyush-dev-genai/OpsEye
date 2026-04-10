import {
  CompressionTypes,
  Kafka,
  type KafkaConfig as KafkaJsConfig,
  type Message,
  type Producer,
  type ProducerConfig,
  type RecordMetadata,
} from "kafkajs";

import {
  createAppConfig,
  getKafkaConfig,
  type AppConfig,
} from "@opseye/config";
import type { KafkaEnvelope, KafkaTopic } from "@opseye/types";

import {
  serializeEnvelope,
  serializeHeaders,
  serializePayload,
} from "./serializers";

export interface KafkaClientFactoryOptions {
  readonly appConfig?: AppConfig;
  readonly kafkaConfig?: Omit<KafkaJsConfig, "brokers" | "clientId">;
}

export interface KafkaProducerOptions extends KafkaClientFactoryOptions {
  readonly producerConfig?: ProducerConfig;
}

export interface PublishMessageOptions<TPayload> {
  readonly topic: KafkaTopic;
  readonly key: string;
  readonly payload: TPayload;
  readonly timestamp?: string;
  readonly headers?: Record<string, string | undefined>;
}

export interface PublishEnvelopeOptions {
  readonly compression?: CompressionTypes;
}

export interface KafkaProducerHandle {
  readonly kafka: Kafka;
  readonly producer: Producer;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publishMessage<TPayload>(
    message: PublishMessageOptions<TPayload>,
    options?: PublishEnvelopeOptions,
  ): Promise<RecordMetadata[]>;
  publishEnvelope<TPayload>(
    envelope: KafkaEnvelope<TPayload>,
    options?: PublishEnvelopeOptions,
  ): Promise<RecordMetadata[]>;
}

export function createKafkaClient(
  options: KafkaClientFactoryOptions = {},
): Kafka {
  const appConfig = options.appConfig ?? createAppConfig();
  const kafkaConfig = getKafkaConfig(appConfig);

  return new Kafka({
    clientId: kafkaConfig.clientId,
    brokers: [...kafkaConfig.brokers],
    ...(options.kafkaConfig ?? {}),
  });
}

function buildMessage<TPayload>(
  message: PublishMessageOptions<TPayload>,
): Message {
  const headers = serializeHeaders(message.headers);

  return {
    key: message.key,
    value: serializePayload(message.payload),
    timestamp:
      message.timestamp !== undefined
        ? Date.parse(message.timestamp).toString()
        : Date.now().toString(),
    ...(headers !== undefined ? { headers } : {}),
  };
}

export function createProducer(
  options: KafkaProducerOptions = {},
): KafkaProducerHandle {
  const kafka = createKafkaClient(options);
  const producer = kafka.producer(options.producerConfig);

  return {
    kafka,
    producer,
    connect: async (): Promise<void> => producer.connect(),
    disconnect: async (): Promise<void> => producer.disconnect(),
    publishMessage: async <TPayload>(
      message: PublishMessageOptions<TPayload>,
      publishOptions: PublishEnvelopeOptions = {},
    ): Promise<RecordMetadata[]> =>
      producer.send({
        topic: message.topic,
        messages: [buildMessage(message)],
        ...(publishOptions.compression !== undefined
          ? { compression: publishOptions.compression }
          : {}),
      }),
    publishEnvelope: async <TPayload>(
      envelope: KafkaEnvelope<TPayload>,
      publishOptions: PublishEnvelopeOptions = {},
    ): Promise<RecordMetadata[]> =>
      producer.send({
        topic: envelope.topic,
        messages: [serializeEnvelope(envelope)],
        ...(publishOptions.compression !== undefined
          ? { compression: publishOptions.compression }
          : {}),
      }),
  };
}
