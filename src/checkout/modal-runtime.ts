import type { HttpClient } from "../core/http";
import type { EmitPresentationEvent } from "../presentation/handle";
import { createModalAccessibility } from "../presentation/modal-accessibility";
import { parseCallbackAccepted, parseModalPayload } from "../presentation/modal-callback";
import {
  loadTrustedModalScript,
  type TrustedModalInstance,
  trustedModalOptions,
} from "../presentation/trusted-modal-script";
import type { CheckoutActions, CheckoutLifecycle, ModalPresentation } from "./types";

const modalEvents = [
  "transaction_logged",
  "transaction_failed",
  "transaction_result_available",
  "transaction_timeout",
  "transaction_error",
  "transaction_rejected",
] as const;

interface ModalRuntimeOptions {
  http: HttpClient;
  checkout: { reference: string; actions: CheckoutActions };
  presentation: ModalPresentation;
  document: Document;
  signal: AbortSignal;
  emit: EmitPresentationEvent;
  cspNonce?: string;
  cancel: () => void;
  poll: (signal: AbortSignal, emit: EmitPresentationEvent) => Promise<CheckoutLifecycle>;
}

export async function runModal(options: ModalRuntimeOptions): Promise<CheckoutLifecycle> {
  const accessibility = createModalAccessibility(options.document, options.cancel);
  let modal: TrustedModalInstance | undefined;
  let stopRelay: (() => void) | undefined;
  const scoped = linkedAbortController(options.signal);
  try {
    const Constructor = await loadTrustedModalScript(
      options.presentation,
      options.document,
      options.cspNonce,
      options.signal,
    );
    modal = new Constructor(trustedModalOptions(options.presentation));
    accessibility.announce("Payment dialog opened.");
    options.emit({ type: "opened" });
    const callback = options.checkout.actions.callback;
    if (!callback) throw new TypeError("Modal callback action is missing");
    const relay = relayModalEvents(modal, options.http, callback, scoped.signal, options.emit);
    stopRelay = relay.stop;
    const lifecycle = await options.poll(scoped.signal, (event) => {
      if ("status" in event) accessibility.announce(`Payment status: ${event.status}.`);
      options.emit(event);
    });
    relay.stop();
    return lifecycle;
  } finally {
    stopRelay?.();
    scoped.abort(new DOMException("Presentation settled", "AbortError"));
    try {
      modal?.closeModal();
    } finally {
      accessibility.cleanup();
    }
  }
}

function relayModalEvents(
  modal: TrustedModalInstance,
  http: HttpClient,
  callback: NonNullable<CheckoutActions["callback"]>,
  signal: AbortSignal,
  emit: EmitPresentationEvent,
) {
  let active = true;
  let queue: Promise<void> = Promise.resolve();
  const seen = new Set<string>();
  const receive = (event: string) => (value: unknown) => {
    if (!active || signal.aborted) return;
    try {
      const payload = parseModalPayload(value);
      const fingerprint = `${event}:${JSON.stringify(payload)}`;
      if (seen.has(fingerprint)) return;
      if (seen.size >= 64) {
        active = false;
        return;
      }
      seen.add(fingerprint);
      emit({ type: "callback_received" });
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          emit({ type: "confirming" });
          const response = await http.request(callback.url, {
            method: "POST",
            body: { token: callback.token, payload },
            signal,
          });
          parseCallbackAccepted(response);
        });
      queue.catch(() => undefined);
    } catch {}
  };
  for (const event of modalEvents) modal.on(event, receive(event));
  return {
    stop: () => {
      active = false;
    },
  };
}

function linkedAbortController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener("abort", () => signal.removeEventListener("abort", abort), {
    once: true,
  });
  return controller;
}
