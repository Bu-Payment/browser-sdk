import type { CardSavingOperations } from "../card-saving/client";
import type { CheckoutOperations } from "../checkout/client";
import type { CheckoutResult } from "../checkout/types";
import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type { PaymentMethodSetup } from "../payment-methods/types";
import type { OperationHandle } from "./types";

export interface OperationsClient {
  resume(): OperationHandle<CheckoutResult | PaymentMethodSetup> | undefined;
}

export function createOperationsClient(
  checkout: CheckoutOperations,
  cardSaving: CardSavingOperations,
): OperationsClient {
  let active: OperationHandle<CheckoutResult | PaymentMethodSetup> | undefined;
  return Object.freeze({
    resume() {
      if (active) return active;
      const search = globalThis.location?.search ?? "";
      let operation: OperationHandle<CheckoutResult | PaymentMethodSetup> | undefined;
      if (cardSaving.canResume(search)) {
        if (search) scrubQuery();
        operation = cardSaving.resume(search);
      }
      if (!operation) operation = checkout.resume();
      if (!operation) return undefined;
      active = operation;
      operation.completion
        .finally(() => {
          if (active === operation) active = undefined;
        })
        .catch(() => undefined);
      return operation;
    },
  });
}

function scrubQuery(): void {
  const location = globalThis.location;
  if (!location || typeof globalThis.history?.replaceState !== "function") {
    throw new BuPaymentError("Sensitive return query could not be removed", {
      code: ErrorCode.RESUME_FAILED,
    });
  }
  const url = new URL(location.href);
  url.search = "";
  globalThis.history.replaceState(globalThis.history.state, "", url.href);
}
