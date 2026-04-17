import { describe, expect, it } from "vitest";

import { formatSseEvent } from "../services/sse-event.service";

describe("formatSseEvent", () => {
  it("serializes a realtime query event into SSE wire format", () => {
    const serialized = formatSseEvent({
      queryId: "query_123",
      stage: "retrieving",
      timestamp: "2026-04-18T09:00:00.000Z",
      payload: {
        embeddingModel: "text-embedding-test",
      },
    });

    expect(serialized).toBe(
      'event: retrieving\ndata: {"queryId":"query_123","stage":"retrieving","timestamp":"2026-04-18T09:00:00.000Z","payload":{"embeddingModel":"text-embedding-test"}}\n\n',
    );
  });
});
