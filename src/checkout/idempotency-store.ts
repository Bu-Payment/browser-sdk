import { ErrorCode, OperationKind } from "../constants";
import type { ClientConfig } from "../core/config";
import { BuPaymentError } from "../errors";
import type { CreateCheckoutInput } from "./types";

interface RetryRecord {
  version: 1;
  intent: string;
  idempotencyKey: string;
  expiresAt: string;
}

export interface CheckoutIdempotency {
  run<T>(input: CreateCheckoutInput, create: (idempotencyKey: string) => Promise<T>): Promise<T>;
}

export function createCheckoutIdempotency(
  config: ClientConfig,
  storage: Storage | undefined,
  now: () => Date,
): CheckoutIdempotency {
  const flights = new Map<string, Promise<unknown>>();
  const prefix = digest(scope(config)).then((value) => `bu-payment:idempotency:v1:${value}`);
  return {
    async run<T>(input: CreateCheckoutInput, create: (idempotencyKey: string) => Promise<T>) {
      const intent = await digest(canonicalIntent(input));
      const active = flights.get(intent) as Promise<T> | undefined;
      if (active) return active;
      const operation = execute(prefix, intent, storage, now, create).finally(() => {
        flights.delete(intent);
      });
      flights.set(intent, operation);
      return operation;
    },
  };
}

async function execute<T>(
  prefix: Promise<string>,
  intent: string,
  storage: Storage | undefined,
  now: () => Date,
  create: (idempotencyKey: string) => Promise<T>,
): Promise<T> {
  const storageKey = `${await prefix}:${intent}`;
  const record = readRecord(storage, storageKey, intent, now);
  const idempotencyKey = record?.idempotencyKey ?? generateIdempotencyKey();
  if (!record) saveRecord(storage, storageKey, intent, idempotencyKey, now);
  try {
    const result = await create(idempotencyKey);
    safely(() => storage?.removeItem(storageKey));
    return result;
  } catch (error) {
    if (error instanceof BuPaymentError && !isAmbiguous(error)) {
      safely(() => storage?.removeItem(storageKey));
    }
    throw error;
  }
}

function isAmbiguous(error: BuPaymentError): boolean {
  return (
    error.code === ErrorCode.NETWORK_UNAVAILABLE ||
    error.code === ErrorCode.OPERATION_CANCELLED ||
    error.code === ErrorCode.OPERATION_TIMED_OUT
  );
}

function readRecord(
  storage: Storage | undefined,
  storageKey: string,
  intent: string,
  now: () => Date,
): RetryRecord | undefined {
  const serialized = safely(() => storage?.getItem(storageKey));
  if (!serialized) return undefined;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value, intent) || Date.parse(value.expiresAt) <= now().getTime()) {
      safely(() => storage?.removeItem(storageKey));
      return undefined;
    }
    return value;
  } catch {
    safely(() => storage?.removeItem(storageKey));
    return undefined;
  }
}

function saveRecord(
  storage: Storage | undefined,
  storageKey: string,
  intent: string,
  idempotencyKey: string,
  now: () => Date,
): void {
  const expiresAt = new Date(now().getTime() + 15 * 60_000).toISOString();
  safely(() =>
    storage?.setItem(storageKey, JSON.stringify({ version: 1, intent, idempotencyKey, expiresAt })),
  );
}

function isRecord(value: unknown, intent: string): value is RetryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") === "expiresAt,idempotencyKey,intent,version" &&
    record.version === 1 &&
    record.intent === intent &&
    typeof record.idempotencyKey === "string" &&
    /^[!-~]{16,200}$/u.test(record.idempotencyKey) &&
    typeof record.expiresAt === "string" &&
    !Number.isNaN(Date.parse(record.expiresAt))
  );
}

function canonicalIntent(input: CreateCheckoutInput): string {
  return JSON.stringify([
    input.priceId.trim(),
    input.email.trim().toLowerCase(),
    input.quantity,
    input.destinationKey.trim(),
  ]);
}

function scope(config: ClientConfig): string {
  const origin = globalThis.location?.origin ?? "non-browser";
  return `${origin}|${config.apiBaseUrl.href}|${config.publishableKey}|${OperationKind.CHECKOUT}`;
}

async function digest(value: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new TypeError("Web Crypto digest support is required");
  }
  const bytes = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("Web Crypto UUID support is required");
  }
  return globalThis.crypto.randomUUID();
}

function safely<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch {
    return undefined;
  }
}
