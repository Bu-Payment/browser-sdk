import { createBuPaymentClient } from "../../src";

const cardSaving = createBuPaymentClient({
  publishableKey: "bup_pk_test_example",
  apiBaseUrl: "https://api.example.test",
}).cardSaving;

cardSaving.resume();
cardSaving.status();

// @ts-expect-error resume derives its inputs and lifecycle configuration internally.
cardSaving.resume({ timeoutMs: 1_000 });
// @ts-expect-error status derives its reference and customer session internally.
cardSaving.status({ signal: new AbortController().signal });
