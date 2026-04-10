import type { KafkaMessage } from "kafkajs";

import type {
  KafkaEnvelope,
  KafkaMessageHeaders,
  KafkaTopic,
} from "@opseye/types";

export class KafkaSerializationError extends Error {
  public constructor(message: string, options?: { readonly cause?: Error }) {
    super(message, options);
    this.name = "KafkaSerializationError";
  }
}

export interface SerializedKafkaMessage {
  readonly key: string;
  readonly value: string;
  readonly timestamp: string;
  readonly headers?: Record<string, string>;
}

function decodeBuffer(value: Buffer): string {
  return value.toString("utf8");
}

export function serializePayload<TPayload>(payload: TPayload): string {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    throw new KafkaSerializationError(
      "Failed to serialize Kafka payload.",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

export function deserializePayload<TPayload>(
  value: Buffer | string | null | undefined,
): TPayload {
  if (value === null || value === undefined) {
    throw new KafkaSerializationError("Kafka message payload is required.");
  }

  const rawValue = typeof value === "string" ? value : decodeBuffer(value);

  try {
    return JSON.parse(rawValue) as TPayload;
  } catch (error) {
    throw new KafkaSerializationError(
      "Failed to deserialize Kafka payload.",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

export function serializeHeaders(
  headers?: KafkaMessageHeaders,
): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const serializedHeaders = Object.entries(headers).reduce<
    Record<string, string>
  >((accumulator, [key, value]) => {
    if (value !== undefined) {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});

  return Object.keys(serializedHeaders).length > 0
    ? serializedHeaders
    : undefined;
}

export function deserializeHeaders(
  headers: KafkaMessage["headers"],
): KafkaMessageHeaders | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const normalizedHeaders = Object.entries(headers).reduce<
    Record<string, string | undefined>
  >((accumulator, [key, value]) => {
    if (value === undefined) {
      return accumulator;
    }

    if (Array.isArray(value)) {
      const [firstValue] = value;
      accumulator[key] =
        typeof firstValue === "string"
          ? firstValue
          : firstValue !== undefined
            ? decodeBuffer(firstValue)
            : undefined;
      return accumulator;
    }

    accumulator[key] = typeof value === "string" ? value : decodeBuffer(value);
    return accumulator;
  }, {});

  return Object.keys(normalizedHeaders).length > 0
    ? normalizedHeaders
    : undefined;
}

export function serializeEnvelope<TPayload>(
  envelope: KafkaEnvelope<TPayload>,
): SerializedKafkaMessage {
  const headers = serializeHeaders(envelope.headers);

  return {
    key: envelope.key,
    value: serializePayload(envelope.payload),
    timestamp: Date.parse(envelope.timestamp).toString(),
    ...(headers !== undefined ? { headers } : {}),
  };
}

export function deserializeEnvelope<TPayload>(
  topic: KafkaTopic,
  message: KafkaMessage,
): KafkaEnvelope<TPayload> {
  const key = message.key?.toString("utf8");
  const headers = deserializeHeaders(message.headers);

  if (key === undefined) {
    throw new KafkaSerializationError("Kafka message key is required.");
  }

  return {
    key,
    topic,
    timestamp:
      message.timestamp.length > 0
        ? new Date(Number(message.timestamp)).toISOString()
        : new Date().toISOString(),
    ...(headers !== undefined ? { headers } : {}),
    payload: deserializePayload<TPayload>(message.value),
  };
}
