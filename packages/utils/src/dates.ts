export function toIsoTimestamp(value: Date | string | number): string {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value.");
  }

  return date.toISOString();
}

export function parseIsoTimestamp(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return parsed;
}

export function isValidDateRange(start: Date, end: Date): boolean {
  return start.getTime() <= end.getTime();
}

export function differenceInMilliseconds(start: Date, end: Date): number {
  return end.getTime() - start.getTime();
}
