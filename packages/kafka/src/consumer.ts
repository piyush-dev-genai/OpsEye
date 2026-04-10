import {
  Kafka,
  type Consumer,
  type ConsumerConfig,
  type ConsumerRunConfig,
  type EachBatchPayload,
  type EachMessagePayload,
  type KafkaConfig as KafkaJsConfig,
} from "kafkajs";

import {
  createAppConfig,
  getKafkaConfig,
  type AppConfig,
} from "@opseye/config";
import type { KafkaEnvelope, KafkaTopic } from "@opseye/types";

import { createKafkaClient } from "./producer";
import { deserializeEnvelope } from "./serializers";

export interface KafkaConsumerFactoryOptions {
  readonly appConfig?: AppConfig;
  readonly kafkaConfig?: Omit<KafkaJsConfig, "brokers" | "clientId">;
  readonly consumerConfig: Omit<ConsumerConfig, "groupId"> & {
    readonly groupIdSuffix: string;
  };
}

export interface SubscribeTopicOptions {
  readonly topic: KafkaTopic;
  readonly fromBeginning?: boolean;
}

export interface TypedEachMessagePayload<TPayload> {
  readonly envelope: KafkaEnvelope<TPayload>;
  readonly raw: EachMessagePayload;
}

export interface TypedEachBatchPayload<TPayload> {
  readonly envelopes: readonly KafkaEnvelope<TPayload>[];
  readonly raw: EachBatchPayload;
}

export interface TypedConsumerRunOptions<TPayload> {
  readonly eachMessage?: (
    payload: TypedEachMessagePayload<TPayload>,
  ) => Promise<void>;
  readonly eachBatch?: (
    payload: TypedEachBatchPayload<TPayload>,
  ) => Promise<void>;
  readonly autoCommit?: ConsumerRunConfig["autoCommit"];
  readonly autoCommitInterval?: ConsumerRunConfig["autoCommitInterval"];
  readonly autoCommitThreshold?: ConsumerRunConfig["autoCommitThreshold"];
  readonly partitionsConsumedConcurrently?: ConsumerRunConfig["partitionsConsumedConcurrently"];
}

export interface KafkaConsumerHandle {
  readonly kafka: Kafka;
  readonly consumer: Consumer;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(options: SubscribeTopicOptions): Promise<void>;
  run<TPayload>(options: TypedConsumerRunOptions<TPayload>): Promise<void>;
}

function createGroupId(options: KafkaConsumerFactoryOptions): string {
  const appConfig = options.appConfig ?? createAppConfig();
  const kafkaConfig = getKafkaConfig(appConfig);
  return `${kafkaConfig.groupIdPrefix}-${options.consumerConfig.groupIdSuffix}`;
}

export function createConsumer(
  options: KafkaConsumerFactoryOptions,
): KafkaConsumerHandle {
  const kafka = createKafkaClient({
    ...(options.appConfig !== undefined
      ? { appConfig: options.appConfig }
      : {}),
    ...(options.kafkaConfig !== undefined
      ? { kafkaConfig: options.kafkaConfig }
      : {}),
  });
  const consumer = kafka.consumer({
    ...options.consumerConfig,
    groupId: createGroupId(options),
  });

  return {
    kafka,
    consumer,
    connect: async (): Promise<void> => consumer.connect(),
    disconnect: async (): Promise<void> => consumer.disconnect(),
    subscribe: async (subscribeOptions: SubscribeTopicOptions): Promise<void> =>
      consumer.subscribe({
        topic: subscribeOptions.topic,
        fromBeginning: subscribeOptions.fromBeginning ?? false,
      }),
    run: async <TPayload>(
      runOptions: TypedConsumerRunOptions<TPayload>,
    ): Promise<void> =>
      consumer.run({
        ...(runOptions.autoCommit !== undefined
          ? { autoCommit: runOptions.autoCommit }
          : {}),
        ...(runOptions.autoCommitInterval !== undefined
          ? { autoCommitInterval: runOptions.autoCommitInterval }
          : {}),
        ...(runOptions.autoCommitThreshold !== undefined
          ? { autoCommitThreshold: runOptions.autoCommitThreshold }
          : {}),
        ...(runOptions.partitionsConsumedConcurrently !== undefined
          ? {
              partitionsConsumedConcurrently:
                runOptions.partitionsConsumedConcurrently,
            }
          : {}),
        ...(runOptions.eachMessage !== undefined
          ? {
              eachMessage: async (payload: EachMessagePayload): Promise<void> =>
                runOptions.eachMessage?.({
                  envelope: deserializeEnvelope<TPayload>(
                    payload.topic as KafkaTopic,
                    payload.message,
                  ),
                  raw: payload,
                }),
            }
          : {}),
        ...(runOptions.eachBatch !== undefined
          ? {
              eachBatch: async (payload: EachBatchPayload): Promise<void> => {
                const envelopes = payload.batch.messages.map((message) =>
                  deserializeEnvelope<TPayload>(
                    payload.batch.topic as KafkaTopic,
                    message,
                  ),
                );

                await runOptions.eachBatch?.({
                  envelopes,
                  raw: payload,
                });
              },
            }
          : {}),
      }),
  };
}
