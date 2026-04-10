import { randomUUID } from "node:crypto";

export interface CreatePrefixedIdOptions {
  readonly prefix: string;
  readonly separator?: string;
}

function normalizePrefix(prefix: string): string {
  const normalizedPrefix = prefix.trim();

  if (normalizedPrefix.length === 0) {
    throw new Error("ID prefix must not be empty.");
  }

  return normalizedPrefix;
}

export function createId(): string {
  return randomUUID();
}

export function createPrefixedId(options: CreatePrefixedIdOptions): string {
  const prefix = normalizePrefix(options.prefix);
  const separator = options.separator ?? "_";

  return `${prefix}${separator}${createId()}`;
}
