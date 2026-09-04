import { ErrorCode } from "../constants";
import { apiUrl, type ClientConfig } from "../core/config";
import { asObject, asString, assertExactKeys } from "../core/validation";
import { BuPaymentError, errorFromResponse, toBuPaymentError } from "../errors";
import type { BrowserApplicationSession, BrowserCapability } from "./types";

interface SessionManagerOptions {
  config: ClientConfig;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

export interface SessionManager {
  getToken(signal?: AbortSignal): Promise<string>;
  invalidate(token: string): void;
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  let session: BrowserApplicationSession | undefined;
  let pending: Promise<BrowserApplicationSession> | undefined;

  async function issue(signal?: AbortSignal): Promise<BrowserApplicationSession> {
    const response = await options.fetch(
      apiUrl(options.config.apiBaseUrl, "public/v1/application-sessions"),
      {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishableKey: options.config.publishableKey }),
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok) throw await errorFromResponse(response);
    return parseSessionResponse(await response.json());
  }

  async function renew(current: BrowserApplicationSession, signal?: AbortSignal) {
    const response = await options.fetch(
      apiUrl(options.config.apiBaseUrl, "public/v1/application-sessions/renew"),
      {
        method: "POST",
        credentials: "omit",
        headers: { "Bu-Payment-Session": current.token },
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok) throw await errorFromResponse(response);
    return parseSessionResponse(await response.json());
  }

  async function refresh(signal?: AbortSignal): Promise<BrowserApplicationSession> {
    if (!session) return issue(signal);
    try {
      return await renew(session, signal);
    } catch (error) {
      if (
        error instanceof BuPaymentError &&
        (error.code === ErrorCode.APPLICATION_SESSION_ROTATED ||
          error.code === ErrorCode.APPLICATION_SESSION_EXPIRED)
      ) {
        session = undefined;
        return issue(signal);
      }
      throw error;
    }
  }

  return {
    async getToken(signal) {
      if (session && options.now().getTime() < Date.parse(session.renewAfter)) return session.token;
      pending ??= refresh().finally(() => {
        pending = undefined;
      });
      session = await waitForCaller(pending, signal);
      return session.token;
    },
    invalidate(token) {
      if (session?.token === token) session = undefined;
    },
  };
}

function parseSessionResponse(value: unknown): BrowserApplicationSession {
  try {
    return parseSession(value);
  } catch (error) {
    throw toBuPaymentError(
      error,
      ErrorCode.RESPONSE_INVALID,
      "Application session response is invalid",
    );
  }
}

function waitForCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function parseSession(value: unknown): BrowserApplicationSession {
  const object = asObject(value, "Application session");
  assertExactKeys(
    object,
    ["token", "expiresAt", "renewAfter", "capabilities"],
    "Application session",
  );
  if (!Array.isArray(object.capabilities)) throw new TypeError("capabilities must be an array");
  const capabilities = object.capabilities.map((value) => asString(value, "capability"));
  if (capabilities.some((value) => value !== "catalogue:read" && value !== "checkout:create")) {
    throw new TypeError("Application session capability is invalid");
  }
  const expiresAt = asString(object.expiresAt, "expiresAt");
  const renewAfter = asString(object.renewAfter, "renewAfter");
  const expiresAtMs = Date.parse(expiresAt);
  const renewAfterMs = Date.parse(renewAfter);
  if (Number.isNaN(expiresAtMs) || Number.isNaN(renewAfterMs) || renewAfterMs >= expiresAtMs) {
    throw new TypeError("Application session timestamps are invalid");
  }
  return {
    token: asString(object.token, "token"),
    expiresAt,
    renewAfter,
    capabilities: capabilities as BrowserCapability[],
  };
}
