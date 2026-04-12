import {
  createClient,
  type RedisClientOptions,
  type RedisClientType,
} from "redis";

import { createAppConfig, type AppConfig } from "@opseye/config";

export type RedisVectorStoreClient = ReturnType<typeof createClient>;

export interface RedisVectorStoreClientOptions {
  readonly appConfig?: AppConfig;
  readonly url?: string;
  readonly clientOptions?: Omit<RedisClientOptions, "url">;
}

export class VectorStoreConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "VectorStoreConfigurationError";
  }
}

function requireRedisUrl(url?: string): string {
  if (url === undefined || url.trim().length === 0) {
    throw new VectorStoreConfigurationError(
      "Vector store URL is required to create the Redis client.",
    );
  }

  return url;
}

export function createRedisVectorStoreClient(
  options: RedisVectorStoreClientOptions = {},
): RedisVectorStoreClient {
  const appConfig = options.appConfig ?? createAppConfig();
  const url = requireRedisUrl(options.url ?? appConfig.vectorStore.url);

  return createClient({
    url,
    ...(options.clientOptions ?? {}),
  });
}

export function getVectorStoreIndexName(
  appConfig: AppConfig = createAppConfig(),
): string {
  return appConfig.vectorStore.indexName;
}
