interface CataloguePage<T> {
    data: T[];
    nextCursor: string | null;
}
interface Product {
    id: string;
    name: string;
    description: string | null;
}
interface Price {
    id: string;
    productId: string;
    unitAmount: number;
    currency: string;
    type: "one_time" | "recurring";
    recurring: null | {
        interval: "day" | "week" | "month" | "year";
        intervalCount: number;
    };
    description: string | null;
    lookupKey: string | null;
}

interface ListOptions {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
}
interface PriceListOptions extends ListOptions {
    productId?: string;
}
interface CatalogueClient {
    listProducts(options?: ListOptions): Promise<CataloguePage<Product>>;
    getProduct(productId: string, options?: {
        signal?: AbortSignal;
    }): Promise<Product>;
    listPrices(options?: PriceListOptions): Promise<CataloguePage<Price>>;
}

type CheckoutType = "payment" | "subscription";
type CheckoutStatus = "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled";
interface CreateCheckoutInput {
    priceId: string;
    email: string;
    quantity: number;
    destinationKey: string;
}
interface RedirectPresentation {
    kind: "redirect";
    url: string;
}
interface ModalPresentation {
    kind: "modal";
    script: {
        url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";
    };
    configuration: {
        sessionToken: string;
        amount: number;
        currency: string;
        reference: string;
    };
    callback: {
        url: string;
        token: string;
    };
}
interface CheckoutCreated {
    reference: string;
    type: CheckoutType;
    status: "pending";
    presentationVersion: 1;
    presentation: RedirectPresentation | ModalPresentation;
    checkoutUrl?: string;
    createdAt: string;
    expiresAt: string;
}
interface CheckoutLifecycle {
    reference: string;
    type: CheckoutType;
    status: CheckoutStatus;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}

interface CheckoutRequestOptions {
    idempotencyKey?: string;
    signal?: AbortSignal;
}
interface CheckoutClient {
    create(input: CreateCheckoutInput, options?: CheckoutRequestOptions): Promise<CheckoutCreated>;
    getStatus(reference: string, options?: {
        signal?: AbortSignal;
    }): Promise<CheckoutLifecycle>;
    redirect(checkout: CheckoutCreated, navigate?: (url: string) => void): void;
}

interface BuPaymentClientOptions {
    publishableKey: string;
    apiBaseUrl: string;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
}
interface BuPaymentClient {
    catalogue: CatalogueClient;
    checkout: CheckoutClient;
}
declare function createBuPaymentClient(options: BuPaymentClientOptions): BuPaymentClient;

interface BuPaymentErrorOptions {
    code: string;
    status: number;
    requestId?: string | undefined;
    cause?: unknown;
}
declare class BuPaymentError extends Error {
    readonly code: string;
    readonly status: number;
    readonly requestId: string | undefined;
    constructor(message: string, options: BuPaymentErrorOptions);
    toJSON(): {
        name: string;
        code: string;
        status: number;
        requestId: string | undefined;
    };
}
declare class SessionMalformedError extends BuPaymentError {
}
declare class SessionInvalidError extends BuPaymentError {
}
declare class SessionExpiredError extends BuPaymentError {
}
declare class SessionRotatedError extends BuPaymentError {
}
declare class CapabilityDeniedError extends BuPaymentError {
}
declare class RateLimitedError extends BuPaymentError {
}
declare class ValidationError extends BuPaymentError {
}
declare class NotFoundError extends BuPaymentError {
}
declare class IdempotencyConflictError extends BuPaymentError {
}
declare class CheckoutDestinationUnavailableError extends BuPaymentError {
}
declare class CheckoutLiveNotEnabledError extends BuPaymentError {
}
declare class CheckoutProviderFailedError extends BuPaymentError {
}
declare class CheckoutUnavailableError extends BuPaymentError {
}
declare class SessionUnavailableError extends BuPaymentError {
}
declare class CatalogueUnavailableError extends BuPaymentError {
}

type BrowserCapability = "catalogue:read" | "checkout:create";
interface BrowserApplicationSession {
    token: string;
    expiresAt: string;
    renewAfter: string;
    capabilities: BrowserCapability[];
}

export { type BrowserApplicationSession, type BrowserCapability, type BuPaymentClient, type BuPaymentClientOptions, BuPaymentError, CapabilityDeniedError, type CatalogueClient, type CataloguePage, CatalogueUnavailableError, type CheckoutClient, type CheckoutCreated, CheckoutDestinationUnavailableError, type CheckoutLifecycle, CheckoutLiveNotEnabledError, CheckoutProviderFailedError, type CheckoutRequestOptions, type CheckoutStatus, type CheckoutType, CheckoutUnavailableError, type CreateCheckoutInput, IdempotencyConflictError, type ListOptions, type ModalPresentation, NotFoundError, type Price, type PriceListOptions, type Product, RateLimitedError, type RedirectPresentation, SessionExpiredError, SessionInvalidError, SessionMalformedError, SessionRotatedError, SessionUnavailableError, ValidationError, createBuPaymentClient };
