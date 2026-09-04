import type { CardSavingOperations } from "../card-saving/client";
import { hasCardSavingVerificationQuery } from "../card-saving/resume-query";
import type { CheckoutOperations } from "../checkout/client";
import { ErrorCode, OperationKind, type OperationKind as OperationKindValue } from "../constants";
import { BuPaymentError } from "../errors";
import type { OperationHandle, ResumedOperation } from "./types";

export interface OperationsClient {
  resume(): ResumedOperation | undefined;
}

export function createOperationsClient(
  checkout: CheckoutOperations,
  cardSaving: CardSavingOperations,
): OperationsClient {
  let active: ResumedOperation | undefined;
  return Object.freeze({
    resume() {
      if (active) return active;
      let search: string;
      try {
        search = globalThis.location?.search ?? "";
      } catch (error) {
        return activate(rejectedResume(OperationKind.CARD_SAVING, error));
      }

      let verificationQuery: boolean;
      try {
        verificationQuery = hasCardSavingVerificationQuery(search);
        if (verificationQuery) scrubQuery();
      } catch (error) {
        return activate(rejectedResume(OperationKind.CARD_SAVING, error));
      }

      let canResumeCardSaving: boolean;
      try {
        canResumeCardSaving = cardSaving.canResume(search);
      } catch (error) {
        return activate(rejectedResume(OperationKind.CARD_SAVING, error));
      }

      if (canResumeCardSaving) {
        try {
          if (search && !verificationQuery) scrubQuery();
          return activate(tagResume(OperationKind.CARD_SAVING, cardSaving.resume(search)));
        } catch (error) {
          return activate(rejectedResume(OperationKind.CARD_SAVING, error));
        }
      }

      try {
        const operation = checkout.resume();
        if (!operation) return undefined;
        return activate(tagResume(OperationKind.CHECKOUT, operation));
      } catch (error) {
        return activate(rejectedResume(OperationKind.CHECKOUT, error));
      }
    },
  });

  function activate(operation: ResumedOperation): ResumedOperation {
    active = operation;
    operation.completion
      .finally(() => {
        if (active === operation) active = undefined;
      })
      .catch(() => undefined);
    return operation;
  }
}

function tagResume<T, TKind extends OperationKindValue>(
  kind: TKind,
  operation: OperationHandle<T>,
): OperationHandle<T, TKind> {
  return Object.freeze({
    kind,
    completion: operation.completion,
    cancel: () => operation.cancel(),
  });
}

function rejectedResume<TKind extends OperationKindValue>(
  kind: TKind,
  error: unknown,
): OperationHandle<never, TKind> {
  const failure = resumeFailure(error);
  return Object.freeze({ kind, completion: Promise.reject(failure), cancel: () => undefined });
}

function resumeFailure(error: unknown): BuPaymentError {
  if (error instanceof BuPaymentError && error.code === ErrorCode.RESUME_INVALID) return error;
  if (error instanceof BuPaymentError && error.code === ErrorCode.RESUME_FAILED) return error;
  return new BuPaymentError("Operation could not be resumed", { code: ErrorCode.RESUME_FAILED });
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
