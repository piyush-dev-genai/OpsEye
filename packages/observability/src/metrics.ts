import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from "prom-client";

export interface MetricsOptions {
  readonly serviceName: string;
  readonly defaultLabels?: Record<string, string>;
  readonly collectDefaultMetrics?: boolean;
  readonly defaultMetricPrefix?: string;
}

export interface Metrics {
  readonly registry: Registry;
  readonly createCounter: <TLabel extends string>(
    configuration: CounterConfiguration<TLabel>,
  ) => Counter<TLabel>;
  readonly createGauge: <TLabel extends string>(
    configuration: GaugeConfiguration<TLabel>,
  ) => Gauge<TLabel>;
  readonly createHistogram: <TLabel extends string>(
    configuration: HistogramConfiguration<TLabel>,
  ) => Histogram<TLabel>;
  getMetrics(): Promise<string>;
  contentType(): string;
}

function applyDefaultLabels(
  registry: Registry,
  options: MetricsOptions,
): void {
  registry.setDefaultLabels({
    service: options.serviceName,
    ...(options.defaultLabels ?? {}),
  });
}

export function createMetrics(options: MetricsOptions): Metrics {
  const registry = new Registry();
  applyDefaultLabels(registry, options);

  if (options.collectDefaultMetrics ?? true) {
    collectDefaultMetrics({
      register: registry,
      ...(options.defaultMetricPrefix !== undefined
        ? { prefix: options.defaultMetricPrefix }
        : {}),
    });
  }

  return {
    registry,
    createCounter: <TLabel extends string>(
      configuration: CounterConfiguration<TLabel>,
    ): Counter<TLabel> =>
      new Counter({
        ...configuration,
        registers: [registry],
      }),
    createGauge: <TLabel extends string>(
      configuration: GaugeConfiguration<TLabel>,
    ): Gauge<TLabel> =>
      new Gauge({
        ...configuration,
        registers: [registry],
      }),
    createHistogram: <TLabel extends string>(
      configuration: HistogramConfiguration<TLabel>,
    ): Histogram<TLabel> =>
      new Histogram({
        ...configuration,
        registers: [registry],
      }),
    getMetrics: async (): Promise<string> => registry.metrics(),
    contentType: (): string => registry.contentType,
  };
}
