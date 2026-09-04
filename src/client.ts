import { createCardSavingOperations } from "./card-saving/client";
import { createCardSavingStore } from "./card-saving/store";
import type { CardSavingClient } from "./card-saving/types";
import { type CatalogueClient, createCatalogueClient } from "./catalogue/client";
import { type CheckoutClient, createCheckoutOperations } from "./checkout/client";
import { createCheckoutIdempotency } from "./checkout/idempotency-store";
import { ErrorCode } from "./constants";
import { parseClientConfig } from "./core/config";
import { createHttpClient } from "./core/http";
import { BuPaymentError } from "./errors";
import { createOperationsClient, type OperationsClient } from "./operations/client";
import { browserSessionStorage, createPresentationResumeStore } from "./presentation/resume-store";
import { createSessionManager } from "./session/session-manager";

export interface BuPaymentClientOptions {
  publishableKey: string;
  apiBaseUrl: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  storage?: Storage;
}

export interface BuPaymentClient {
  catalogue: CatalogueClient;
  checkout: CheckoutClient;
  cardSaving: CardSavingClient;
  operations: OperationsClient;
}

export function createBuPaymentClient(options: BuPaymentClientOptions): BuPaymentClient {
  const config = parseClientConfig(options);
  const defaultFetch = globalThis.fetch;
  const fetch =
    options.fetch ??
    (typeof defaultFetch === "function" ? defaultFetch.bind(globalThis) : undefined);
  if (typeof fetch !== "function") {
    throw new BuPaymentError("A Fetch API implementation is required", {
      code: ErrorCode.CONFIGURATION_INVALID,
    });
  }
  const now = options.now ?? (() => new Date());
  const sessions = createSessionManager({ config, fetch, now });
  const http = createHttpClient({ config, fetch, sessions });
  const storage = options.storage ?? browserSessionStorage();
  const resumeStore = createPresentationResumeStore(config, storage, now);
  const checkout = createCheckoutOperations(
    http,
    resumeStore,
    createCheckoutIdempotency(config, storage, now),
  );
  const cardSaving = createCardSavingOperations(http, createCardSavingStore(config, storage, now));
  return {
    catalogue: createCatalogueClient(http),
    checkout: checkout.client,
    cardSaving: cardSaving.client,
    operations: createOperationsClient(checkout, cardSaving),
  };
}
