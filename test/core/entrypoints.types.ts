import { BuPaymentError, createBuPaymentClient, ErrorCode, OperationKind } from "../../src";
import type {
  BuPaymentClient,
  CataloguePage,
  Checkout,
  CheckoutResult,
  ErrorCode as ErrorCodeValue,
  OperationEvent,
  OperationHandle,
  OperationKind as OperationKindValue,
  PaymentMethodSetup,
  Price,
  Product,
  ResumedOperation,
} from "../../src/types";

const client: BuPaymentClient = createBuPaymentClient({
  publishableKey: "bup_pk_test_example",
  apiBaseUrl: "https://api.example.test",
});
const kind: OperationKindValue = OperationKind.CHECKOUT;
const code: ErrorCodeValue = ErrorCode.OPERATION_CANCELLED;
const event: OperationEvent = { type: "opening", kind };
const handle = {} as OperationHandle<CheckoutResult | PaymentMethodSetup>;
const resumedOperation = client.operations.resume();
const checkout = {} as Checkout;
const page = {} as CataloguePage<Product | Price>;

async function consumeResumedOperation(operation: ResumedOperation | undefined) {
  if (operation?.kind === OperationKind.CHECKOUT) {
    const resumedCheckout = await operation.completion;
    resumedCheckout.reference;
    // @ts-expect-error checkout completion is not a card-saving setup.
    resumedCheckout.id;
  }
  if (operation?.kind === OperationKind.CARD_SAVING) {
    const resumedSetup = await operation.completion;
    resumedSetup.id;
    // @ts-expect-error card-saving completion is not a checkout.
    resumedSetup.reference;
  }
}

void client;
void code;
void event;
void handle;
void resumedOperation;
void consumeResumedOperation;
void checkout;
void page;
void BuPaymentError;

// @ts-expect-error public types are not exported from the runtime root.
type RemovedRootType = import("../../src").BuPaymentClient;
// @ts-expect-error specialized error classes are removed.
type RemovedError = import("../../src").SessionInvalidError;
void (null as unknown as RemovedRootType);
void (null as unknown as RemovedError);
