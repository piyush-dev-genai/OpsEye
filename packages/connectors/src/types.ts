import type { NormalizedOperationalEvent } from "@opseye/domain";

export interface ConnectorNormalizationContext {
  readonly ingestionTimestamp: string;
  readonly defaultSource: string;
  readonly connectorName: string;
  readonly tags?: readonly string[];
}

export interface ConnectorAdapter<
  TPayload,
  TEvent extends NormalizedOperationalEvent,
> {
  readonly connectorName: string;
  readonly eventType: TEvent["eventType"];
  normalize(payload: TPayload, context: ConnectorNormalizationContext): TEvent;
}
