export type PresentationFlow =
  | "checkout_redirect"
  | "checkout_modal"
  | "checkout_resume"
  | "payment_method_setup"
  | "payment_method_resume";

export type {
  OperationEvent as PresentationEvent,
  OperationHandle as PresentationHandle,
  OperationOptions as PresentationOptions,
} from "../operations/types";
