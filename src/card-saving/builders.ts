import type { CardSavingBuilder, CardSavingChallenge, CardSavingClient } from "./types";

export interface CardSavingStartState {
  email?: string;
  currency?: string;
  consent?: true;
  returnUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface CardSavingOperations {
  start(state: CardSavingStartState): Promise<CardSavingChallenge>;
  resume: CardSavingClient["resume"];
  status: CardSavingClient["status"];
}

export function createCardSavingBuilders(operations: CardSavingOperations): CardSavingClient {
  return Object.freeze({
    ...builderMethods(operations, {}),
    resume: operations.resume,
    status: operations.status,
  }) as CardSavingClient;
}

function createStartBuilder(
  operations: CardSavingOperations,
  state: CardSavingStartState,
): CardSavingBuilder<boolean, boolean, boolean> {
  const complete = Boolean(state.email && state.currency && state.consent === true);
  return Object.freeze({
    ...builderMethods(operations, state),
    ...(complete ? { start: () => operations.start(state) } : {}),
  }) as CardSavingBuilder<boolean, boolean, boolean>;
}

function builderMethods(operations: CardSavingOperations, state: CardSavingStartState) {
  const next = (update: Partial<CardSavingStartState>) =>
    createStartBuilder(operations, { ...state, ...update });
  return {
    email: (email: string) => next({ email }),
    currency: (currency: string) => next({ currency }),
    consent: (consent: true) => next({ consent }),
    returnUrl: (returnUrl: string) => next({ returnUrl }),
    signal: (signal: AbortSignal) => next({ signal }),
    timeoutMs: (timeoutMs: number) => next({ timeoutMs }),
  };
}
