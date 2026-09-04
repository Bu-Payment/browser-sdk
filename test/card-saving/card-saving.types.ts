import { createBuPaymentClient } from "../../src";

const cardSaving = createBuPaymentClient({
  publishableKey: "bup_pk_test_example",
  apiBaseUrl: "https://api.example.test",
}).cardSaving;

cardSaving.status();

// @ts-expect-error status derives its reference and customer session internally.
cardSaving.status({ signal: new AbortController().signal });
