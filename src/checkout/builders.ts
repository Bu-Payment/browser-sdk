import type { OperationHandle, OperationOptions } from "../operations/types";
import { type LifecycleConfiguration, lifecycleConfiguration } from "../presentation/builders";
import type { Checkout, CheckoutResult, CreateCheckoutInput } from "./types";

type CheckoutBuilderState = Partial<CreateCheckoutInput> & OperationOptions;

interface CheckoutBuilderMethods<TState extends CheckoutBuilderState> {
  priceId(priceId: string): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "priceId">>;
  email(email: string): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "email">>;
  quantity(quantity: number): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "quantity">>;
  destinationKey(
    destinationKey: string,
  ): CheckoutBuilder<TState & Pick<CreateCheckoutInput, "destinationKey">>;
  cspNonce(cspNonce: string): CheckoutBuilder<TState>;
  navigate(navigate: (url: string) => void): CheckoutBuilder<TState>;
  onEvent(onEvent: NonNullable<OperationOptions["onEvent"]>): CheckoutBuilder<TState>;
  pollIntervalMs(pollIntervalMs: number): CheckoutBuilder<TState>;
  signal(signal: AbortSignal): CheckoutBuilder<TState>;
  timeoutMs(timeoutMs: number): CheckoutBuilder<TState>;
}

export interface CheckoutReadyBuilder {
  create(): Promise<Checkout>;
  start(): OperationHandle<CheckoutResult>;
}

export type CheckoutBuilder<TState extends CheckoutBuilderState = CheckoutBuilderState> =
  CheckoutBuilderMethods<TState> &
    (TState extends CreateCheckoutInput ? CheckoutReadyBuilder : object);

export interface CheckoutStatusBuilder {
  signal(signal: AbortSignal): CheckoutStatusBuilder;
  get(): Promise<CheckoutResult>;
}

export interface CheckoutOpenBuilder extends LifecycleConfiguration<CheckoutOpenBuilder> {
  navigate(navigate: (url: string) => void): CheckoutOpenBuilder;
  start(): OperationHandle<CheckoutResult>;
}

interface CheckoutPrimitives {
  create(input: CreateCheckoutInput, signal?: AbortSignal): Promise<Checkout>;
  getStatus(reference: string, signal?: AbortSignal): Promise<CheckoutResult>;
  open(checkout: Checkout, options: OperationOptions): OperationHandle<CheckoutResult>;
  start(input: CreateCheckoutInput, options: OperationOptions): OperationHandle<CheckoutResult>;
}

export type CheckoutClient = CheckoutBuilder<Record<never, never>> & {
  status(reference: string): CheckoutStatusBuilder;
  open(checkout: Checkout): CheckoutOpenBuilder;
};

export function createCheckoutBuilders(primitives: CheckoutPrimitives): CheckoutClient {
  return Object.freeze({
    ...createCheckoutBuilder(primitives, {}),
    status: (reference: string) => createStatusBuilder(primitives, reference),
    open: (checkout: Checkout) => createOpenBuilder(primitives, checkout, {}),
  });
}

function createCheckoutBuilder<TState extends CheckoutBuilderState>(
  primitives: CheckoutPrimitives,
  state: TState,
): CheckoutBuilder<TState> {
  const next = (update: Partial<CheckoutBuilderState>) =>
    createCheckoutBuilder(primitives, { ...state, ...update });
  const builder: Record<string, unknown> = {
    priceId: (priceId: string) => next({ priceId }),
    email: (email: string) => next({ email }),
    quantity: (quantity: number) => next({ quantity }),
    destinationKey: (destinationKey: string) => next({ destinationKey }),
    cspNonce: (cspNonce: string) => next({ cspNonce }),
    navigate: (navigate: (url: string) => void) => next({ navigate }),
    onEvent: (onEvent: NonNullable<OperationOptions["onEvent"]>) => next({ onEvent }),
    pollIntervalMs: (pollIntervalMs: number) => next({ pollIntervalMs }),
    signal: (signal: AbortSignal) => next({ signal }),
    timeoutMs: (timeoutMs: number) => next({ timeoutMs }),
  };
  if (hasEveryCheckoutField(state)) {
    const input = checkoutInput(state);
    builder.create = () => primitives.create(input, state.signal);
    builder.start = () => primitives.start(input, operationOptions(state));
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

function createOpenBuilder(
  primitives: CheckoutPrimitives,
  checkout: Checkout,
  options: OperationOptions,
): CheckoutOpenBuilder {
  const next = (nextOptions: OperationOptions) =>
    createOpenBuilder(primitives, checkout, nextOptions);
  return Object.freeze({
    ...lifecycleConfiguration(options, next),
    navigate: (navigate: (url: string) => void) => next({ ...options, navigate }),
    start: () => primitives.open(checkout, options),
  });
}

function hasEveryCheckoutField(
  state: CheckoutBuilderState,
): state is CheckoutBuilderState & CreateCheckoutInput {
  return "priceId" in state && "email" in state && "quantity" in state && "destinationKey" in state;
}

function checkoutInput(state: CheckoutBuilderState & CreateCheckoutInput): CreateCheckoutInput {
  return {
    priceId: state.priceId,
    email: state.email,
    quantity: state.quantity,
    destinationKey: state.destinationKey,
  };
}

function operationOptions(state: CheckoutBuilderState): OperationOptions {
  const { signal, timeoutMs, pollIntervalMs, cspNonce, navigate, onEvent } = state;
  return {
    ...(signal ? { signal } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    ...(cspNonce === undefined ? {} : { cspNonce }),
    ...(navigate === undefined ? {} : { navigate }),
    ...(onEvent === undefined ? {} : { onEvent }),
  };
}
