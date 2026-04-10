import {
  createAppConfig,
  getKafkaTopicConfig,
  type AppConfig,
  type KafkaTopicConfig,
} from "@opseye/config";
import { KAFKA_TOPICS, type KafkaTopic } from "@opseye/types";

export type KafkaTopicName = keyof KafkaTopicConfig;

export const DEFAULT_KAFKA_TOPICS = KAFKA_TOPICS;

export function getTopics(
  config: AppConfig = createAppConfig(),
): KafkaTopicConfig {
  return getKafkaTopicConfig(config);
}

export function getTopic(
  topicName: KafkaTopicName,
  config: AppConfig = createAppConfig(),
): KafkaTopic {
  return getTopics(config)[topicName];
}

export function isKafkaTopic(value: string): value is KafkaTopic {
  return Object.values(DEFAULT_KAFKA_TOPICS).includes(value as KafkaTopic);
}
