import type { AppConfig } from "@opseye/config";

import {
  createOpenAiClient,
  type LlmChatCompletionResult,
  type LlmMessage,
  type OpenAiClientOptions,
} from "../clients/openai.client";

export interface CompleteChatOptions extends OpenAiClientOptions {
  readonly appConfig?: AppConfig;
  readonly messages: readonly LlmMessage[];
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stop?: string | readonly string[];
  readonly user?: string;
}

export async function completeChat(
  options: CompleteChatOptions,
): Promise<LlmChatCompletionResult> {
  const client = createOpenAiClient(options);
  const model = options.model ?? options.appConfig?.llm.chatModel;

  return client.createChatCompletion({
    messages: options.messages,
    ...(model !== undefined ? { model } : {}),
    ...(options.maxTokens !== undefined
      ? { maxTokens: options.maxTokens }
      : {}),
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.stop !== undefined ? { stop: options.stop } : {}),
    ...(options.user !== undefined ? { user: options.user } : {}),
  });
}
