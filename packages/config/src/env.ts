export const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const APP_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const APP_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;

export type AppLogLevel = (typeof APP_LOG_LEVELS)[number];

export interface EnvironmentConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly appEnv: AppEnvironment;
  readonly serviceName: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly logLevel: AppLogLevel;
  readonly kafkaBrokers: readonly string[];
  readonly kafkaClientId: string;
  readonly kafkaGroupIdPrefix: string;
  readonly llmApiKey?: string;
  readonly llmBaseUrl?: string;
  readonly llmApiVersion?: string;
  readonly llmChatModel: string;
  readonly llmEmbeddingModel: string;
  readonly vectorStoreUrl?: string;
  readonly vectorStoreIndex: string;
}

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n- ${issues.join("\n- ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

interface StringOption {
  readonly required?: boolean;
  readonly defaultValue?: string;
  readonly allowEmpty?: boolean;
}

interface NumberOption {
  readonly required?: boolean;
  readonly defaultValue?: number;
  readonly integer?: boolean;
  readonly min?: number;
}

interface EnumOption<T extends string> {
  readonly values: readonly T[];
  readonly required?: boolean;
  readonly defaultValue?: T;
}

function readString(
  source: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  option: StringOption = {},
): string | undefined {
  const rawValue = source[key];

  if (rawValue === undefined) {
    if (option.defaultValue !== undefined) {
      return option.defaultValue;
    }

    if (option.required) {
      issues.push(`${key} is required.`);
    }

    return undefined;
  }

  const value = rawValue.trim();
  const allowEmpty = option.allowEmpty ?? false;

  if (!allowEmpty && value.length === 0) {
    issues.push(`${key} must not be empty.`);
    return undefined;
  }

  return value;
}

function readNumber(
  source: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  option: NumberOption = {},
): number | undefined {
  const rawValue = source[key];

  if (rawValue === undefined) {
    if (option.defaultValue !== undefined) {
      return option.defaultValue;
    }

    if (option.required) {
      issues.push(`${key} is required.`);
    }

    return undefined;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    issues.push(`${key} must be a valid number.`);
    return undefined;
  }

  if (option.integer && !Number.isInteger(parsed)) {
    issues.push(`${key} must be an integer.`);
    return undefined;
  }

  if (option.min !== undefined && parsed < option.min) {
    issues.push(`${key} must be greater than or equal to ${option.min}.`);
    return undefined;
  }

  return parsed;
}

function readEnum<T extends string>(
  source: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  option: EnumOption<T>,
): T | undefined {
  const rawValue = source[key];

  if (rawValue === undefined) {
    if (option.defaultValue !== undefined) {
      return option.defaultValue;
    }

    if (option.required) {
      issues.push(`${key} is required.`);
    }

    return undefined;
  }

  if (option.values.includes(rawValue as T)) {
    return rawValue as T;
  }

  issues.push(`${key} must be one of: ${option.values.join(", ")}.`);
  return undefined;
}

function readCsv(
  source: NodeJS.ProcessEnv,
  key: string,
  issues: string[],
  defaultValue: readonly string[],
): readonly string[] {
  const rawValue = source[key];

  if (rawValue === undefined) {
    return defaultValue;
  }

  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    issues.push(`${key} must contain at least one comma-separated value.`);
    return defaultValue;
  }

  return values;
}

function requireValue<T>(
  value: T | undefined,
  key: keyof EnvironmentConfig,
): T {
  if (value === undefined) {
    throw new Error(`Missing validated environment value for ${String(key)}.`);
  }

  return value;
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): EnvironmentConfig {
  const issues: string[] = [];

  const nodeEnv = readEnum(source, "NODE_ENV", issues, {
    values: NODE_ENVIRONMENTS,
    defaultValue: "development",
  });
  const appEnv = readEnum(source, "APP_ENV", issues, {
    values: APP_ENVIRONMENTS,
    defaultValue: "development",
  });
  const serviceName = readString(source, "SERVICE_NAME", issues, {
    defaultValue: "opseye",
  });
  const apiHost = readString(source, "API_HOST", issues, {
    defaultValue: "0.0.0.0",
  });
  const apiPort = readNumber(source, "API_PORT", issues, {
    defaultValue: 3000,
    integer: true,
    min: 1,
  });
  const logLevel = readEnum(source, "LOG_LEVEL", issues, {
    values: APP_LOG_LEVELS,
    defaultValue: "info",
  });
  const kafkaBrokers = readCsv(source, "KAFKA_BROKERS", issues, [
    "localhost:9092",
  ]);
  const kafkaClientId = readString(source, "KAFKA_CLIENT_ID", issues, {
    defaultValue: "opseye",
  });
  const kafkaGroupIdPrefix = readString(
    source,
    "KAFKA_GROUP_ID_PREFIX",
    issues,
    {
      defaultValue: "opseye",
    },
  );
  const llmApiKey = readString(source, "LLM_API_KEY", issues);
  const llmBaseUrl = readString(source, "LLM_BASE_URL", issues);
  const llmApiVersion = readString(source, "LLM_API_VERSION", issues);
  const llmModel = readString(source, "LLM_MODEL", issues);
  const llmChatModel = readString(source, "LLM_CHAT_MODEL", issues, {
    defaultValue: llmModel ?? "gpt-4.1-mini",
  });
  const llmEmbeddingModel = readString(source, "LLM_EMBEDDING_MODEL", issues, {
    defaultValue: llmModel ?? "text-embedding-3-small",
  });
  const vectorStoreUrl = readString(source, "VECTOR_STORE_URL", issues);
  const vectorStoreIndex = readString(source, "VECTOR_STORE_INDEX", issues, {
    defaultValue: "opseye",
  });

  if (issues.length > 0) {
    throw new EnvironmentValidationError(issues);
  }

  return {
    nodeEnv: requireValue(nodeEnv, "nodeEnv"),
    appEnv: requireValue(appEnv, "appEnv"),
    serviceName: requireValue(serviceName, "serviceName"),
    apiHost: requireValue(apiHost, "apiHost"),
    apiPort: requireValue(apiPort, "apiPort"),
    logLevel: requireValue(logLevel, "logLevel"),
    kafkaBrokers,
    kafkaClientId: requireValue(kafkaClientId, "kafkaClientId"),
    kafkaGroupIdPrefix: requireValue(kafkaGroupIdPrefix, "kafkaGroupIdPrefix"),
    llmChatModel: requireValue(llmChatModel, "llmChatModel"),
    llmEmbeddingModel: requireValue(llmEmbeddingModel, "llmEmbeddingModel"),
    vectorStoreIndex: requireValue(vectorStoreIndex, "vectorStoreIndex"),
    ...(llmApiKey !== undefined ? { llmApiKey } : {}),
    ...(llmBaseUrl !== undefined ? { llmBaseUrl } : {}),
    ...(llmApiVersion !== undefined ? { llmApiVersion } : {}),
    ...(vectorStoreUrl !== undefined ? { vectorStoreUrl } : {}),
  };
}
