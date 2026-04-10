export interface TracingOptions {
  readonly serviceName: string;
  readonly environment: string;
  readonly exporterUrl?: string;
}

export interface TracingHandle {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly environment: string;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

class NoopTracingHandle implements TracingHandle {
  public readonly enabled = false;

  public constructor(
    public readonly serviceName: string,
    public readonly environment: string,
  ) {}

  public async start(): Promise<void> {
    return Promise.resolve();
  }

  public async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export function createTracing(options: TracingOptions): TracingHandle {
  return new NoopTracingHandle(options.serviceName, options.environment);
}
