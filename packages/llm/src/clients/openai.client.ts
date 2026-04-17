import { createAppConfig, type AppConfig } from "@opseye/config";

export type LlmMessageRole = "developer" | "system" | "user" | "assistant";

export interface LlmMessage {
  readonly role: LlmMessageRole;
  readonly content: string;
}

export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens?: number;
  readonly totalTokens: number;
}

export interface LlmChatCompletionResult {
  readonly id: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage?: LlmUsage;
}

export interface LlmEmbeddingResult {
  readonly model: string;
  readonly embedding: readonly number[];
  readonly usage?: LlmUsage;
}

export interface LlmBatchEmbeddingResult {
  readonly model: string;
  readonly embeddings: readonly (readonly number[])[];
  readonly usage?: LlmUsage;
}

export interface OpenAiClientOptions {
  readonly appConfig?: AppConfig;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
  readonly authMode?: "api-key" | "bearer";
  readonly model?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface OpenAiEmbeddingRequest {
  readonly input: string;
  readonly model?: string;
  readonly dimensions?: number;
  readonly user?: string;
}

export interface OpenAiEmbeddingsRequest {
  readonly input: readonly string[];
  readonly model?: string;
  readonly dimensions?: number;
  readonly user?: string;
}

export interface OpenAiChatCompletionRequest {
  readonly messages: readonly LlmMessage[];
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stop?: string | readonly string[];
  readonly user?: string;
}

interface OpenAiUsageResponse {
  readonly prompt_tokens: number;
  readonly completion_tokens?: number;
  readonly total_tokens: number;
}

interface OpenAiEmbeddingResponse {
  readonly data: readonly {
    readonly index: number;
    readonly embedding: readonly number[];
  }[];
  readonly model: string;
  readonly usage?: OpenAiUsageResponse;
}

interface OpenAiChatCompletionResponse {
  readonly id: string;
  readonly model: string;
  readonly usage?: OpenAiUsageResponse;
  readonly choices: readonly {
    readonly finish_reason: string | null;
    readonly message: {
      readonly content: string | null;
    };
  }[];
}

interface OpenAiErrorResponse {
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string;
  };
}

interface RequestOptions {
  readonly path: string;
  readonly body: string;
}

export class LlmConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LlmConfigurationError";
  }
}

export class OpenAiRequestError extends Error {
  public readonly status: number;

  public constructor(
    message: string,
    status: number,
    options?: { readonly cause?: Error },
  ) {
    super(message, options);
    this.name = "OpenAiRequestError";
    this.status = status;
  }
}

function normalizeUsage(usage?: OpenAiUsageResponse): LlmUsage | undefined {
  if (usage === undefined) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens,
    totalTokens: usage.total_tokens,
    ...(usage.completion_tokens !== undefined
      ? { completionTokens: usage.completion_tokens }
      : {}),
  };
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const errorResponse = (await response.json()) as OpenAiErrorResponse;

    if (errorResponse.error?.message !== undefined) {
      return errorResponse.error.message;
    }
  } catch {
    return `OpenAI request failed with status ${response.status}.`;
  }

  return `OpenAI request failed with status ${response.status}.`;
}

function requireApiKey(apiKey?: string): string {
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new LlmConfigurationError(
      "LLM API key is required for OpenAI requests.",
    );
  }

  return apiKey;
}

function requireBaseUrl(baseUrl?: string): string {
  if (baseUrl === undefined || baseUrl.trim().length === 0) {
    throw new LlmConfigurationError(
      "LLM base URL is required for provider requests.",
    );
  }

  return baseUrl;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (trimmedBaseUrl.endsWith("/openai/v1")) {
    return trimmedBaseUrl;
  }

  if (
    trimmedBaseUrl.includes(".openai.azure.com") ||
    trimmedBaseUrl.includes(".services.ai.azure.com")
  ) {
    return `${trimmedBaseUrl}/openai/v1`;
  }

  if (trimmedBaseUrl.endsWith("/v1")) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}/v1`;
}

function resolveAuthMode(
  baseUrl: string,
  authMode?: "api-key" | "bearer",
): "api-key" | "bearer" {
  if (authMode !== undefined) {
    return authMode;
  }

  return baseUrl.includes(".azure.com") ? "api-key" : "bearer";
}

function buildUrl(baseUrl: string, path: string, apiVersion?: string): string {
  const url = new URL(`${baseUrl}${path}`);

  if (apiVersion !== undefined && apiVersion.trim().length > 0) {
    url.searchParams.set("api-version", apiVersion);
  }

  return url.toString();
}

function buildHeaders(
  apiKey: string,
  authMode: "api-key" | "bearer",
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(authMode === "api-key"
      ? { "api-key": apiKey }
      : { Authorization: `Bearer ${apiKey}` }),
  };
}

export class OpenAiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string | undefined;
  private readonly authMode: "api-key" | "bearer";
  private readonly defaultModel: string;
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(options: OpenAiClientOptions = {}) {
    const appConfig = options.appConfig ?? createAppConfig();
    this.apiKey = requireApiKey(options.apiKey ?? appConfig.llm.apiKey);
    this.baseUrl = normalizeBaseUrl(
      requireBaseUrl(options.baseUrl ?? appConfig.llm.baseUrl),
    );
    this.apiVersion = options.apiVersion ?? appConfig.llm.apiVersion;
    this.authMode = resolveAuthMode(this.baseUrl, options.authMode);
    this.defaultModel = options.model ?? appConfig.llm.chatModel;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  private async post(request: RequestOptions): Promise<Response> {
    return this.fetcher(buildUrl(this.baseUrl, request.path, this.apiVersion), {
      method: "POST",
      headers: buildHeaders(this.apiKey, this.authMode),
      body: request.body,
    });
  }

  public async createEmbedding(
    request: OpenAiEmbeddingRequest,
  ): Promise<LlmEmbeddingResult> {
    const result = await this.createEmbeddings({
      input: [request.input],
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(request.dimensions !== undefined
        ? { dimensions: request.dimensions }
        : {}),
      ...(request.user !== undefined ? { user: request.user } : {}),
    });

    const [firstEmbedding] = result.embeddings;

    if (firstEmbedding === undefined) {
      throw new OpenAiRequestError(
        "OpenAI embeddings response did not contain any vectors.",
        500,
      );
    }

    return {
      model: result.model,
      embedding: firstEmbedding,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
  }

  public async createEmbeddings(
    request: OpenAiEmbeddingsRequest,
  ): Promise<LlmBatchEmbeddingResult> {
    if (request.input.length === 0) {
      throw new LlmConfigurationError(
        "Embeddings input must contain at least one text value.",
      );
    }

    const response = await this.post({
      path: "/embeddings",
      body: JSON.stringify({
        input: request.input,
        model: request.model ?? this.defaultModel,
        encoding_format: "float",
        ...(request.dimensions !== undefined
          ? { dimensions: request.dimensions }
          : {}),
        ...(request.user !== undefined ? { user: request.user } : {}),
      }),
    });

    if (!response.ok) {
      throw new OpenAiRequestError(
        await parseErrorResponse(response),
        response.status,
      );
    }

    const payload = (await response.json()) as OpenAiEmbeddingResponse;

    if (payload.data.length === 0) {
      throw new OpenAiRequestError(
        "OpenAI embeddings response did not contain any vectors.",
        response.status,
      );
    }

    const usage = normalizeUsage(payload.usage);
    const embeddings = [...payload.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    return {
      model: payload.model,
      embeddings,
      ...(usage !== undefined ? { usage } : {}),
    };
  }

  public async createChatCompletion(
    request: OpenAiChatCompletionRequest,
  ): Promise<LlmChatCompletionResult> {
    const response = await this.post({
      path: "/chat/completions",
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        ...(request.maxTokens !== undefined
          ? { max_tokens: request.maxTokens }
          : {}),
        ...(request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
        ...(request.stop !== undefined ? { stop: request.stop } : {}),
        ...(request.user !== undefined ? { user: request.user } : {}),
      }),
    });

    if (!response.ok) {
      throw new OpenAiRequestError(
        await parseErrorResponse(response),
        response.status,
      );
    }

    const payload = (await response.json()) as OpenAiChatCompletionResponse;
    const [firstChoice] = payload.choices;

    if (firstChoice === undefined) {
      throw new OpenAiRequestError(
        "OpenAI chat completion response did not contain any choices.",
        response.status,
      );
    }

    const usage = normalizeUsage(payload.usage);

    return {
      id: payload.id,
      model: payload.model,
      content: firstChoice.message.content ?? "",
      finishReason: firstChoice.finish_reason,
      ...(usage !== undefined ? { usage } : {}),
    };
  }
}

export function createOpenAiClient(
  options: OpenAiClientOptions = {},
): OpenAiClient {
  return new OpenAiClient(options);
}
