import type { ClientConfig } from "../core/config";

export type ResumableFlow = "checkout" | "payment_method";

interface ResumeState {
  version: 1;
  flow: ResumableFlow;
  reference: string;
  expiresAt: string;
}

export interface PresentationResumeStore {
  save(flow: ResumableFlow, reference: string, expiresAt: string): void;
  read(flow: ResumableFlow): ResumeState | undefined;
  clear(flow: ResumableFlow): void;
}

export function createPresentationResumeStore(
  config: ClientConfig,
  storage: Storage | undefined,
  now: () => Date,
): PresentationResumeStore {
  const key = `bu-payment:presentation:${fingerprint(scope(config))}`;
  return {
    save(flow, reference, expiresAt) {
      safely(() =>
        storage?.setItem(
          keyFor(key, flow),
          JSON.stringify({ version: 1, flow, reference, expiresAt }),
        ),
      );
    },
    read(flow) {
      const storageKey = keyFor(key, flow);
      const serialized = safely(() => storage?.getItem(storageKey));
      if (!serialized) return undefined;
      try {
        const value: unknown = JSON.parse(serialized);
        if (!isResumeState(value, flow) || Date.parse(value.expiresAt) <= now().getTime()) {
          safely(() => storage?.removeItem(storageKey));
          return undefined;
        }
        return value;
      } catch {
        safely(() => storage?.removeItem(storageKey));
        return undefined;
      }
    },
    clear(flow) {
      safely(() => storage?.removeItem(keyFor(key, flow)));
    },
  };
}

function safely<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch {
    return undefined;
  }
}

export function browserSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function isResumeState(value: unknown, flow: ResumableFlow): value is ResumeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort().join(",");
  return (
    keys === "expiresAt,flow,reference,version" &&
    object.version === 1 &&
    object.flow === flow &&
    typeof object.reference === "string" &&
    object.reference.length > 0 &&
    typeof object.expiresAt === "string" &&
    !Number.isNaN(Date.parse(object.expiresAt))
  );
}

function scope(config: ClientConfig): string {
  const origin =
    typeof globalThis.location === "undefined" ? "non-browser" : globalThis.location.origin;
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

function keyFor(key: string, flow: ResumableFlow): string {
  return `${key}:${flow}`;
}
