import type { PresentationEvent, PresentationOptions } from "./types";

export interface LifecycleConfiguration<TBuilder> {
  cspNonce(cspNonce: string): TBuilder;
  onEvent(onEvent: (event: PresentationEvent) => void): TBuilder;
  pollIntervalMs(pollIntervalMs: number): TBuilder;
  signal(signal: AbortSignal): TBuilder;
  timeoutMs(timeoutMs: number): TBuilder;
}

export function lifecycleConfiguration<
  TBuilder,
  TOptions extends PresentationOptions = PresentationOptions,
>(options: TOptions, next: (options: TOptions) => TBuilder): LifecycleConfiguration<TBuilder> {
  return {
    cspNonce: (cspNonce) => next({ ...options, cspNonce }),
    onEvent: (onEvent) => next({ ...options, onEvent }),
    pollIntervalMs: (pollIntervalMs) => next({ ...options, pollIntervalMs }),
    signal: (signal) => next({ ...options, signal }),
    timeoutMs: (timeoutMs) => next({ ...options, timeoutMs }),
  };
}
