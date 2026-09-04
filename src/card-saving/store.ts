import type { ClientConfig } from "../core/config";

export interface ChallengeState {
  reference: string;
  expiresAt: string;
  currency: string;
  returnUrl: string;
  idempotencyKey?: string;
}

export interface CustomerState {
  token: string;
  expiresAt: string;
}

export interface SetupState {
  reference: string;
  expiresAt: string;
}

export interface CardSavingStore {
  saveChallenge(state: ChallengeState): void;
  readChallenge(): ChallengeState | undefined;
  clearChallenge(): void;
  saveCustomer(state: CustomerState): void;
  readCustomer(): CustomerState | undefined;
  clearCustomer(): void;
  saveSetup(state: SetupState): void;
  readSetup(): SetupState | undefined;
  clearSetup(): void;
}

export function createCardSavingStore(
  config: ClientConfig,
  storage: Storage | undefined,
  now: () => Date,
): CardSavingStore {
  const prefix = `bu-payment:card-saving:${fingerprint(scope(config))}`;
  const save = (name: string, value: object) =>
    safely(() => storage?.setItem(`${prefix}:${name}`, JSON.stringify({ version: 1, ...value })));
  const clear = (name: string) => safely(() => storage?.removeItem(`${prefix}:${name}`));
  const read = <T extends { expiresAt: string }>(
    name: string,
    valid: (value: unknown) => value is T,
  ) => {
    const serialized = safely(() => storage?.getItem(`${prefix}:${name}`));
    if (!serialized) return undefined;
    try {
      const value: unknown = JSON.parse(serialized);
      if (!valid(value) || Date.parse(value.expiresAt) <= now().getTime()) {
        clear(name);
        return undefined;
      }
      return value;
    } catch {
      clear(name);
      return undefined;
    }
  };
  return {
    saveChallenge: (state) => save("challenge", state),
    readChallenge: () => read("challenge", isChallenge),
    clearChallenge: () => clear("challenge"),
    saveCustomer: (state) => save("customer", state),
    readCustomer: () => read("customer", isCustomer),
    clearCustomer: () => clear("customer"),
    saveSetup: (state) => save("setup", state),
    readSetup: () => read("setup", isSetup),
    clearSetup: () => clear("setup"),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === keys.sort().join(",");
}

function common(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  const item = record(value);
  if (!item || !exact(item, ["version", "expiresAt", ...keys]) || item.version !== 1) return;
  if (typeof item.expiresAt !== "string" || Number.isNaN(Date.parse(item.expiresAt))) return;
  return item;
}

function isChallenge(value: unknown): value is ChallengeState {
  const item = common(value, ["reference", "currency", "returnUrl", "idempotencyKey"]);
  if (!item) {
    const withoutKey = common(value, ["reference", "currency", "returnUrl"]);
    return Boolean(withoutKey && challengeFields(withoutKey));
  }
  return challengeFields(item) && typeof item.idempotencyKey === "string";
}

function challengeFields(item: Record<string, unknown>): boolean {
  return (
    typeof item.reference === "string" &&
    /^bup_cec_(?:live|test)_[A-Za-z0-9_-]{43}$/u.test(item.reference) &&
    typeof item.currency === "string" &&
    /^[A-Z]{3}$/u.test(item.currency) &&
    typeof item.returnUrl === "string"
  );
}

function isCustomer(value: unknown): value is CustomerState {
  const item = common(value, ["token"]);
  return Boolean(
    item &&
      typeof item.token === "string" &&
      /^bup_cs_(?:live|test)_[A-Za-z0-9_-]{43}$/u.test(item.token),
  );
}

function isSetup(value: unknown): value is SetupState {
  const item = common(value, ["reference"]);
  return Boolean(item && typeof item.reference === "string");
}

function safely<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch {
    return undefined;
  }
}

function scope(config: ClientConfig): string {
  const origin = globalThis.location?.origin ?? "non-browser";
  return `${origin}|${config.apiBaseUrl.href}|${config.publishableKey}`;
}

function fingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
