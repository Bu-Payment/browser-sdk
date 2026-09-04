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
} from "../../src/types";

const client: BuPaymentClient = createBuPaymentClient({
  publishableKey: "bup_pk_test_example",
  apiBaseUrl: "https://api.example.test",
});
const kind: OperationKindValue = OperationKind.CHECKOUT;
const code: ErrorCodeValue = ErrorCode.OPERATION_CANCELLED;
const event: OperationEvent = { type: "opening", kind };
const handle = {} as OperationHandle<CheckoutResult | PaymentMethodSetup>;
const checkout = {} as Checkout;
const page = {} as CataloguePage<Product | Price>;

void client;
void code;
void event;
void handle;
void checkout;
void page;
void BuPaymentError;

// @ts-expect-error public types are not exported from the runtime root.
type RemovedRootType = import("../../src").BuPaymentClient;
// @ts-expect-error specialized error classes are removed.
type RemovedError = import("../../src").SessionInvalidError;
void (null as unknown as RemovedRootType);
void (null as unknown as RemovedError);
