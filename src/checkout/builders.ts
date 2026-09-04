import { type LifecycleConfiguration, lifecycleConfiguration } from "../presentation/builders";
import type { PresentationHandle, PresentationOptions } from "../presentation/types";
import type { CheckoutCreated, CheckoutLifecycle, CreateCheckoutInput } from "./types";

interface CheckoutRequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

type CheckoutBuilderState = Partial<CreateCheckoutInput & CheckoutRequestOptions>;

interface CheckoutBuilderMethods<TState extends CheckoutBuilderState> {
  priceId(priceId: string): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "priceId">>;
  email(email: string): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "email">>;
  quantity(quantity: number): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "quantity">>;
  destinationKey(
    destinationKey: string,
  ): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "destinationKey">>;
  idempotencyKey(
    idempotencyKey: string,
  ): CheckoutBuilder<TState & Pick<CheckoutRequestOptions, "idempotencyKey">>;
  signal(signal: AbortSignal): CheckoutBuilder<TState & Pick<CheckoutRequestOptions, "signal">>;
}

export interface CheckoutReadyBuilder {
  create(): Promise<CheckoutCreated>;
}

export type CheckoutBuilder<TState extends CheckoutBuilderState = CheckoutBuilderState> =
  CheckoutBuilderMethods<TState> &
    (TState extends CreateCheckoutInput ? CheckoutReadyBuilder : object);

export interface CheckoutStatusBuilder {
  signal(signal: AbortSignal): CheckoutStatusBuilder;
  get(): Promise<CheckoutLifecycle>;
}

export interface CheckoutPresentationBuilder
  extends LifecycleConfiguration<CheckoutPresentationBuilder> {
  navigate(navigate: (url: string) => void): CheckoutPresentationBuilder;
  start(): PresentationHandle<CheckoutLifecycle>;
}

export interface CheckoutResumeBuilder extends LifecycleConfiguration<CheckoutResumeBuilder> {
  reference(reference: string): CheckoutResumeBuilder;
  start(): PresentationHandle<CheckoutLifecycle>;
}

interface CheckoutPrimitives {
  create(input: CreateCheckoutInput, options: CheckoutRequestOptions): Promise<CheckoutCreated>;
  getStatus(reference: string, signal?: AbortSignal): Promise<CheckoutLifecycle>;
  present(
    checkout: CheckoutCreated,
    options: PresentationOptions,
  ): PresentationHandle<CheckoutLifecycle>;
  resume(
    reference: string | undefined,
    options: PresentationOptions,
  ): PresentationHandle<CheckoutLifecycle>;
}

export type CheckoutClient = CheckoutBuilder<Record<never, never>> & {
  status(reference: string): CheckoutStatusBuilder;
  presentation(checkout: CheckoutCreated): CheckoutPresentationBuilder;
  resume(): CheckoutResumeBuilder;
};

export function createCheckoutBuilders(primitives: CheckoutPrimitives): CheckoutClient {
  return Object.freeze({
    ...createCheckoutBuilder(primitives, {}),
    status: (reference: string) => createStatusBuilder(primitives, reference),
    presentation: (checkout: CheckoutCreated) =>
      createPresentationBuilder(primitives, checkout, {}),
    resume: () => createResumeBuilder(primitives, undefined, {}),
  });
}

function createCheckoutBuilder<TState extends CheckoutBuilderState>(
  primitives: CheckoutPrimitives,
  state: TState,
): CheckoutBuilder<TState> {
  const builder: Record<string, unknown> = {
    priceId: (priceId: string) => createCheckoutBuilder(primitives, { ...state, priceId }),
    email: (email: string) => createCheckoutBuilder(primitives, { ...state, email }),
    quantity: (quantity: number) => createCheckoutBuilder(primitives, { ...state, quantity }),
    destinationKey: (destinationKey: string) =>
      createCheckoutBuilder(primitives, { ...state, destinationKey }),
    idempotencyKey: (idempotencyKey: string) =>
      createCheckoutBuilder(primitives, { ...state, idempotencyKey }),
    signal: (signal: AbortSignal) => createCheckoutBuilder(primitives, { ...state, signal }),
  };
  if (hasEveryCheckoutField(state)) {
    builder.create = () =>
      primitives.create(
        {
          priceId: state.priceId,
          email: state.email,
          quantity: state.quantity,
          destinationKey: state.destinationKey,
        },
        {
          ...(state.idempotencyKey !== undefined ? { idempotencyKey: state.idempotencyKey } : {}),
          ...(state.signal ? { signal: state.signal } : {}),
        },
      );
  }
  return Object.freeze(builder) as CheckoutBuilder<TState>;
}

function createStatusBuilder(
  primitives: CheckoutPrimitives,
  reference: string,
  signal?: AbortSignal,
): CheckoutStatusBuilder {
  return Object.freeze({
    signal: (nextSignal: AbortSignal) => createStatusBuilder(primitives, reference, nextSignal),
    get: () => primitives.getStatus(reference, signal),
  });
}

function createPresentationBuilder(
  primitives: CheckoutPrimitives,
  checkout: CheckoutCreated,
  options: PresentationOptions,
): CheckoutPresentationBuilder {
  const next = (nextOptions: PresentationOptions) =>
    createPresentationBuilder(primitives, checkout, nextOptions);
  return Object.freeze({
    ...lifecycleConfiguration(options, next),
    navigate: (navigate: (url: string) => void) => next({ ...options, navigate }),
    start: () => primitives.present(checkout, options),
  });
}

function createResumeBuilder(
  primitives: CheckoutPrimitives,
  reference: string | undefined,
  options: PresentationOptions,
): CheckoutResumeBuilder {
  const next = (nextOptions: PresentationOptions) =>
    createResumeBuilder(primitives, reference, nextOptions);
  return Object.freeze({
    ...lifecycleConfiguration(options, next),
    reference: (nextReference: string) => createResumeBuilder(primitives, nextReference, options),
    start: () => primitives.resume(reference, options),
  });
}

function hasEveryCheckoutField(state: CheckoutBuilderState): state is CreateCheckoutInput {
  return "priceId" in state && "email" in state && "quantity" in state && "destinationKey" in state;
}
