import type { AppConfig } from "@opseye/config";

import {
  createOpenAiClient,
  type LlmBatchEmbeddingResult,
  type LlmEmbeddingResult,
  type OpenAiClientOptions,
} from "../clients/openai.client";

export interface EmbedTextOptions extends OpenAiClientOptions {
  readonly appConfig?: AppConfig;
  readonly text: string;
  readonly model?: string;
  readonly dimensions?: number;
  readonly user?: string;
}

export interface EmbedTextsOptions extends OpenAiClientOptions {
  readonly appConfig?: AppConfig;
  readonly texts: readonly string[];
  readonly model?: string;
  readonly dimensions?: number;
  readonly user?: string;
}

export async function embedText(
  options: EmbedTextOptions,
): Promise<LlmEmbeddingResult> {
  const client = createOpenAiClient(options);

  return client.createEmbedding({
    input: options.text,
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.dimensions !== undefined
      ? { dimensions: options.dimensions }
      : {}),
    ...(options.user !== undefined ? { user: options.user } : {}),
  });
}

export async function embedTexts(
  options: EmbedTextsOptions,
): Promise<LlmBatchEmbeddingResult> {
  const client = createOpenAiClient(options);

  return client.createEmbeddings({
    input: options.texts,
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.dimensions !== undefined
      ? { dimensions: options.dimensions }
      : {}),
    ...(options.user !== undefined ? { user: options.user } : {}),
  });
}
