import type { JsonObject, JsonValue } from "@opseye/domain";
import type { LogAttributes } from "@opseye/types";

import type { ConnectorNormalizationContext } from "./types";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeWhitespace(value);

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeSummary(value: string): string {
  return normalizeWhitespace(value);
}

export function buildNormalizationContext(
  overrides: Partial<ConnectorNormalizationContext> & {
    readonly connectorName: string;
    readonly defaultSource: string;
  },
): ConnectorNormalizationContext {
  return {
    ingestionTimestamp:
      overrides.ingestionTimestamp ?? new Date().toISOString(),
    defaultSource: overrides.defaultSource,
    connectorName: overrides.connectorName,
    ...(overrides.tags !== undefined ? { tags: overrides.tags } : {}),
  };
}

export function readAttributeIdentifier(
  attributes: LogAttributes | undefined,
  keys: readonly string[],
): string | undefined {
  if (attributes === undefined) {
    return undefined;
  }

  const normalizedEntries = Object.entries(attributes).map(
    ([key, value]) => [key.toLowerCase(), value] as const,
  );

  for (const key of keys) {
    const matchedEntry = normalizedEntries.find(
      ([entryKey]) => entryKey === key,
    );

    if (matchedEntry === undefined) {
      continue;
    }

    const [, rawValue] = matchedEntry;

    if (
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim().length === 0)
    ) {
      continue;
    }

    return normalizeWhitespace(String(rawValue));
  }

  return undefined;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => toJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);

    return normalized;
  }

  if (typeof value === "object" && value !== undefined) {
    const normalized = sanitizeJsonObject(value as Record<string, unknown>);
    return normalized;
  }

  return undefined;
}

export function sanitizeJsonObject(value: Record<string, unknown>): JsonObject {
  const normalizedEntries = Object.entries(value)
    .map(([key, entryValue]) => [key, toJsonValue(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);

  return Object.fromEntries(normalizedEntries) as JsonObject;
}

export function buildTags(
  seedTags: readonly string[],
  additionalTags: readonly string[] = [],
): readonly string[] {
  const uniqueTags = new Set(
    [...seedTags, ...additionalTags]
      .map((tag) => normalizeOptionalString(tag))
      .filter((tag): tag is string => tag !== undefined),
  );

  return [...uniqueTags];
}
