import type { RealtimeQueryEvent } from "@opseye/types";

export function formatSseEvent(event: RealtimeQueryEvent): string {
  return `event: ${event.stage}\ndata: ${JSON.stringify(event)}\n\n`;
}
