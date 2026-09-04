import { type LifecycleConfiguration, lifecycleConfiguration } from "../presentation/builders";
import type {
  PresentationEvent,
  PresentationHandle,
  PresentationOptions,
} from "../presentation/types";
import type { PaymentMethodSetup } from "./types";

export interface PaymentMethodPresentationBuilder
  extends LifecycleConfiguration<PaymentMethodPresentationBuilder> {
  navigate(navigate: (url: string) => void): PaymentMethodPresentationBuilder;
  present(): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodResumeBuilder
  extends LifecycleConfiguration<PaymentMethodResumeBuilder> {
  reference(reference: string): PaymentMethodReferencedResumeBuilder;
  returnQuery(returnQuery: string): PaymentMethodResumeBuilder;
  resume(): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodReferencedResumeBuilder
  extends LifecycleConfiguration<PaymentMethodReferencedResumeBuilder> {
  returnQuery(returnQuery: string): PaymentMethodReferencedResumeBuilder;
  resume(): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodReferencedBuilder {
  cspNonce(cspNonce: string): PaymentMethodReferencedResumeBuilder;
  onEvent(onEvent: (event: PresentationEvent) => void): PaymentMethodReferencedResumeBuilder;
  pollIntervalMs(pollIntervalMs: number): PaymentMethodReferencedResumeBuilder;
  returnQuery(returnQuery: string): PaymentMethodReferencedResumeBuilder;
  signal(signal: AbortSignal): PaymentMethodReferencedBuilder;
  timeoutMs(timeoutMs: number): PaymentMethodReferencedResumeBuilder;
  status(): Promise<PaymentMethodSetup>;
  resume(): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodsClient {
  cspNonce(cspNonce: string): PaymentMethodResumeBuilder;
  onEvent(onEvent: (event: PresentationEvent) => void): PaymentMethodResumeBuilder;
  pollIntervalMs(pollIntervalMs: number): PaymentMethodResumeBuilder;
  reference(reference: string): PaymentMethodReferencedBuilder;
  returnQuery(returnQuery: string): PaymentMethodResumeBuilder;
  signal(signal: AbortSignal): PaymentMethodResumeBuilder;
  setup(setup: PaymentMethodSetup): PaymentMethodPresentationBuilder;
  timeoutMs(timeoutMs: number): PaymentMethodResumeBuilder;
  resume(): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodPrimitives {
  getStatus(reference: string, signal?: AbortSignal): Promise<PaymentMethodSetup>;
  present(
    setup: PaymentMethodSetup,
    options: PresentationOptions,
  ): PresentationHandle<PaymentMethodSetup>;
  resume(
    reference: string | undefined,
    options: PaymentMethodResumeOptions,
  ): PresentationHandle<PaymentMethodSetup>;
}

export interface PaymentMethodResumeOptions extends PresentationOptions {
  returnQuery?: string;
}

export function createPaymentMethodBuilders(
  primitives: PaymentMethodPrimitives,
): PaymentMethodsClient {
  const next = (options: PaymentMethodResumeOptions) =>
    createResumeBuilder(primitives, undefined, options);
  return Object.freeze({
    ...lifecycleConfiguration({}, next),
    reference: (reference: string) => createReferencedBuilder(primitives, reference, {}),
    returnQuery: (returnQuery: string) => next({ returnQuery }),
    resume: () => primitives.resume(undefined, {}),
    setup: (setup: PaymentMethodSetup) => createPresentationBuilder(primitives, setup, {}),
  });
}

function createPresentationBuilder(
  primitives: PaymentMethodPrimitives,
  setup: PaymentMethodSetup,
  options: PresentationOptions,
): PaymentMethodPresentationBuilder {
  const next = (nextOptions: PresentationOptions) =>
    createPresentationBuilder(primitives, setup, nextOptions);
  return Object.freeze({
    ...lifecycleConfiguration(options, next),
    navigate: (navigate: (url: string) => void) => next({ ...options, navigate }),
    present: () => primitives.present(setup, options),
  });
}

function createResumeBuilder(
  primitives: PaymentMethodPrimitives,
  reference: string | undefined,
  options: PaymentMethodResumeOptions,
): PaymentMethodResumeBuilder {
  const next = (nextOptions: PaymentMethodResumeOptions) =>
    createResumeBuilder(primitives, reference, nextOptions);
  return Object.freeze({
    ...lifecycleConfiguration(options, next),
    reference: (nextReference: string) =>
      createResumeBuilder(
        primitives,
        nextReference,
        options,
      ) as PaymentMethodReferencedResumeBuilder,
    returnQuery: (returnQuery: string) => next({ ...options, returnQuery }),
    resume: () => primitives.resume(reference, options),
  });
}

function createReferencedBuilder(
  primitives: PaymentMethodPrimitives,
  reference: string,
  options: PaymentMethodResumeOptions,
): PaymentMethodReferencedBuilder {
  const resumeOnly = (nextOptions: PaymentMethodResumeOptions) =>
    createResumeBuilder(primitives, reference, nextOptions) as PaymentMethodReferencedResumeBuilder;
  return Object.freeze({
    cspNonce: (cspNonce: string) => resumeOnly({ ...options, cspNonce }),
    onEvent: (onEvent: (event: PresentationEvent) => void) => resumeOnly({ ...options, onEvent }),
    pollIntervalMs: (pollIntervalMs: number) => resumeOnly({ ...options, pollIntervalMs }),
    returnQuery: (returnQuery: string) => resumeOnly({ ...options, returnQuery }),
    signal: (signal: AbortSignal) =>
      createReferencedBuilder(primitives, reference, { ...options, signal }),
    timeoutMs: (timeoutMs: number) => resumeOnly({ ...options, timeoutMs }),
    status: () => primitives.getStatus(reference, options.signal),
    resume: () => primitives.resume(reference, options),
  });
}
