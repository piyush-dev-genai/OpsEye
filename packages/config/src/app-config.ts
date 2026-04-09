import { loadEnvironment, type EnvironmentConfig } from "./env";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
}

export interface KafkaConfig {
  readonly brokers: readonly string[];
  readonly clientId: string;
  readonly groupIdPrefix: string;
}

export interface KafkaTopicConfig {
  readonly logsRaw: "logs.raw";
  readonly queryRequested: "query.requested";
  readonly deadletterEvents: "deadletter.events";
}

export interface LlmConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model: string;
}

export interface VectorStoreConfig {
  readonly url?: string;
  readonly indexName: string;
}

export interface ObservabilityConfig {
  readonly serviceName: string;
  readonly environment: EnvironmentConfig["appEnv"];
  readonly logLevel: EnvironmentConfig["logLevel"];
}

export interface AppConfig {
  readonly runtime: Pick<EnvironmentConfig, "nodeEnv" | "appEnv">;
  readonly server: ServerConfig;
  readonly kafka: KafkaConfig;
  readonly topics: KafkaTopicConfig;
  readonly llm: LlmConfig;
  readonly vectorStore: VectorStoreConfig;
  readonly observability: ObservabilityConfig;
}

export function createAppConfig(
  environment: EnvironmentConfig = loadEnvironment(),
): AppConfig {
  return {
    runtime: {
      nodeEnv: environment.nodeEnv,
      appEnv: environment.appEnv,
    },
    server: {
      host: environment.apiHost,
      port: environment.apiPort,
    },
    kafka: {
      brokers: environment.kafkaBrokers,
      clientId: environment.kafkaClientId,
      groupIdPrefix: environment.kafkaGroupIdPrefix,
    },
    topics: {
      logsRaw: "logs.raw",
      queryRequested: "query.requested",
      deadletterEvents: "deadletter.events",
    },
    llm: {
      model: environment.llmModel,
      ...(environment.llmApiKey !== undefined
        ? { apiKey: environment.llmApiKey }
        : {}),
      ...(environment.llmBaseUrl !== undefined
        ? { baseUrl: environment.llmBaseUrl }
        : {}),
    },
    vectorStore: {
      indexName: environment.vectorStoreIndex,
      ...(environment.vectorStoreUrl !== undefined
        ? { url: environment.vectorStoreUrl }
        : {}),
    },
    observability: {
      serviceName: environment.serviceName,
      environment: environment.appEnv,
      logLevel: environment.logLevel,
    },
  };
}

export function getServerConfig(
  config: AppConfig = createAppConfig(),
): ServerConfig {
  return config.server;
}

export function getKafkaConfig(
  config: AppConfig = createAppConfig(),
): KafkaConfig {
  return config.kafka;
}

export function getKafkaTopicConfig(
  config: AppConfig = createAppConfig(),
): KafkaTopicConfig {
  return config.topics;
}
