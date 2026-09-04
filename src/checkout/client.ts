import type { HttpClient } from "../core/http";
import { createPresentationHandle } from "../presentation/handle";
import { pollCanonical } from "../presentation/poll";
import type { PresentationResumeStore } from "../presentation/resume-store";
import { presentationSingleFlight } from "../presentation/single-flight";
import type { PresentationHandle, PresentationOptions } from "../presentation/types";
import { runModal } from "./modal-runtime";
import type { CheckoutCreated, CheckoutLifecycle, CreateCheckoutInput } from "./types";
import {
  parseCheckoutCreated,
  parseCheckoutLifecycle,
  parseCreateCheckoutInput,
} from "./validation";

export interface CheckoutRequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

interface CheckoutOperations {
  create(input: CreateCheckoutInput, options?: CheckoutRequestOptions): Promise<CheckoutCreated>;
  getStatus(reference: string, options?: { signal?: AbortSignal }): Promise<CheckoutLifecycle>;
  redirect(checkout: CheckoutCreated, navigate?: (url: string) => void): void;
  present(
    checkout: CheckoutCreated,
    options?: PresentationOptions,
  ): PresentationHandle<CheckoutLifecycle>;
  resume(reference?: string, options?: PresentationOptions): PresentationHandle<CheckoutLifecycle>;
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

export type CheckoutClient = CheckoutOperations & CheckoutBuilder<Record<never, never>>;

export function createCheckoutClient(
  http: HttpClient,
  resumeStore?: PresentationResumeStore,
): CheckoutClient {
  const flights = new Map<string, PresentationHandle<CheckoutLifecycle>>();
  const client: CheckoutClient = {
    ...createFluentCheckout(http, {}),
    async create(input, options = {}) {
      return createCheckout(http, input, options);
    },
    async getStatus(reference, options = {}) {
      if (!reference) throw new TypeError("Checkout reference must not be empty");
      const value = await http.request(`public/v1/checkouts/${encodeURIComponent(reference)}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return parseCheckoutLifecycle(value);
    },
    redirect(checkout, navigate = defaultNavigate) {
      if (checkout.presentation?.kind !== "redirect") {
        throw new TypeError("Checkout presentation is not a redirect");
      }
      navigate(validateRedirectUrl(checkout.presentation.url));
    },
    present(checkout, options = {}) {
      const parsed = parseCheckoutCreated(checkout);
      if (!parsed.presentation || (parsed.status !== "pending" && parsed.status !== "processing")) {
        throw new TypeError("Checkout does not have an active presentation");
      }
      if (parsed.presentation.kind === "redirect") {
        validateRedirectUrl(parsed.presentation.url);
        return presentationSingleFlight(flights, parsed.reference, () =>
          storedHandle(
            resumeStore,
            parsed.reference,
            parsed.expiresAt,
            createPresentationHandle("checkout_redirect", options, async (signal, emit) => {
              client.redirect(parsed, options.navigate);
              emit({ type: "opened" });
              return pollCheckout(client, parsed.reference, signal, emit, options.pollIntervalMs);
            }),
          ),
        );
      }
      const document = globalThis.document;
      if (!document) throw new TypeError("A browser document is required for modal presentations");
      const presentation = parsed.presentation;
      return presentationSingleFlight(flights, parsed.reference, () => {
        let handle: PresentationHandle<CheckoutLifecycle>;
        handle = createPresentationHandle("checkout_modal", options, (signal, emit) =>
          runModal({
            http,
            checkout: parsed,
            presentation,
            document,
            signal,
            emit,
            ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
            cancel: () => handle.cancel(),
            poll: (pollSignal, pollEmit) =>
              pollCheckout(client, parsed.reference, pollSignal, pollEmit, options.pollIntervalMs),
          }),
        );
        return storedHandle(resumeStore, parsed.reference, parsed.expiresAt, handle);
      });
    },
    resume(reference, options = {}) {
      const resolved = reference ?? resumeStore?.read("checkout")?.reference;
      if (!resolved) throw new TypeError("No resumable checkout presentation was found");
      return presentationSingleFlight(flights, resolved, () => {
        let handle: PresentationHandle<CheckoutLifecycle>;
        handle = createPresentationHandle("checkout_resume", options, async (signal, emit) => {
          const current = await client.getStatus(resolved, { signal });
          if (checkoutTerminals.has(current.status)) {
            emit({
              type: checkoutSuccess.has(current.status) ? "completed" : "failed",
              status: current.status,
            });
            return current;
          }
          if (current.presentation?.kind === "modal") {
            const document = globalThis.document;
            if (!document)
              throw new TypeError("A browser document is required for modal presentations");
            return runModal({
              http,
              checkout: current,
              presentation: current.presentation,
              document,
              signal,
              emit,
              ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
              cancel: () => handle.cancel(),
              poll: (pollSignal, pollEmit) =>
                pollCheckout(client, resolved, pollSignal, pollEmit, options.pollIntervalMs),
            });
          }
          return pollCheckout(client, resolved, signal, emit, options.pollIntervalMs);
        });
        return clearCheckoutOnSuccess(resumeStore, handle);
      });
    },
  };
  return client;
}

function storedHandle<T>(
  store: PresentationResumeStore | undefined,
  reference: string,
  expiresAt: string,
  handle: PresentationHandle<T>,
): PresentationHandle<T> {
  store?.save("checkout", reference, expiresAt);
  return clearCheckoutOnSuccess(store, handle);
}

function clearCheckoutOnSuccess<T>(
  store: PresentationResumeStore | undefined,
  handle: PresentationHandle<T>,
): PresentationHandle<T> {
  handle.completion.then(
    () => store?.clear("checkout"),
    () => undefined,
  );
  return handle;
}

const checkoutTerminals = new Set(["completed", "failed", "expired", "cancelled"]);
const checkoutSuccess = new Set(["completed"]);

function pollCheckout(
  client: CheckoutClient,
  reference: string,
  signal: AbortSignal,
  emit: Parameters<typeof pollCanonical>[2],
  interval?: number,
) {
  return pollCanonical(
    (requestSignal) => client.getStatus(reference, { signal: requestSignal }),
    signal,
    emit,
    checkoutTerminals,
    checkoutSuccess,
    interval,
  );
}

function validateRedirectUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TypeError("Checkout redirect must use HTTPS without credentials or fragment");
  }
  return url.href;
}

function createFluentCheckout<TState extends CheckoutBuilderState>(
  http: HttpClient,
  state: TState,
): CheckoutBuilder<TState> {
  const builder: Record<string, unknown> = {
    priceId: (priceId: string) => createFluentCheckout(http, { ...state, priceId }),
    email: (email: string) => createFluentCheckout(http, { ...state, email }),
    quantity: (quantity: number) => createFluentCheckout(http, { ...state, quantity }),
    destinationKey: (destinationKey: string) =>
      createFluentCheckout(http, { ...state, destinationKey }),
    idempotencyKey: (idempotencyKey: string) =>
      createFluentCheckout(http, { ...state, idempotencyKey }),
    signal: (signal: AbortSignal) => createFluentCheckout(http, { ...state, signal }),
  };
  if (hasEveryCheckoutField(state)) {
    builder.create = () =>
      createCheckout(
        http,
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

function hasEveryCheckoutField(state: CheckoutBuilderState): state is CreateCheckoutInput {
  return "priceId" in state && "email" in state && "quantity" in state && "destinationKey" in state;
}

async function createCheckout(
  http: HttpClient,
  input: CreateCheckoutInput,
  options: CheckoutRequestOptions,
): Promise<CheckoutCreated> {
  const body = parseCreateCheckoutInput(input);
  const idempotencyKey = options.idempotencyKey ?? generateIdempotencyKey();
  assertIdempotencyKey(idempotencyKey);
  const value = await http.request("public/v1/checkouts", {
    method: "POST",
    body,
    idempotencyKey,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseCheckoutCreated(value);
}

function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("crypto.randomUUID is required to generate an idempotency key");
  }
  return globalThis.crypto.randomUUID();
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 16 || value.length > 200 || !/^[!-~]+$/.test(value)) {
    throw new TypeError("Idempotency key must be 16 to 200 printable ASCII characters");
  }
}

function defaultNavigate(url: string): void {
  globalThis.location.assign(url);
}
