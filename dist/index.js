// src/core/validation.ts
function asObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} response is invalid`);
  }
  return value;
}
function asString(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
}
function asNullableString(value, field) {
  if (value === null) return null;
  return asString(value, field);
}
function assertExactKeys(object, keys, label) {
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} response contains unexpected fields`);
  }
}

// src/catalogue/client.ts
function createCatalogueClient(http) {
  return {
    async listProducts(options = {}) {
      const query = buildListQuery(options);
      const value = await http.request(`public/v1/catalogue/products${query}`, {
        ...options.signal ? { signal: options.signal } : {}
      });
      return parsePage(value, parseProduct);
    },
    async getProduct(productId, options = {}) {
      if (!productId) throw new TypeError("productId must not be empty");
      const value = await http.request(
        `public/v1/catalogue/products/${encodeURIComponent(productId)}`,
        options.signal ? { signal: options.signal } : {}
      );
      return parseProduct(value);
    },
    async listPrices(options = {}) {
      const query = buildListQuery(options, options.productId);
      const value = await http.request(`public/v1/catalogue/prices${query}`, {
        ...options.signal ? { signal: options.signal } : {}
      });
      return parsePage(value, parsePrice);
    }
  };
}
function buildListQuery(options, productId) {
  if (options.limit !== void 0 && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  const query = new URLSearchParams();
  if (options.cursor !== void 0) {
    if (!options.cursor) throw new TypeError("cursor must not be empty");
    query.set("cursor", options.cursor);
  }
  if (options.limit !== void 0) query.set("limit", String(options.limit));
  if (productId !== void 0) {
    if (!productId.trim()) throw new TypeError("productId must not be empty");
    query.set("productId", productId);
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}
function parsePage(value, parseItem) {
  const object = asObject(value, "Catalogue page");
  assertExactKeys(object, ["data", "nextCursor"], "Catalogue page");
  if (!Array.isArray(object.data)) throw new TypeError("Catalogue data must be an array");
  if (object.nextCursor !== null && typeof object.nextCursor !== "string") {
    throw new TypeError("Catalogue nextCursor must be a string or null");
  }
  return { data: object.data.map(parseItem), nextCursor: object.nextCursor };
}
function parseProduct(value) {
  const object = asObject(value, "Product");
  assertExactKeys(object, ["id", "name", "description"], "Product");
  return {
    id: asString(object.id, "id"),
    name: asString(object.name, "name"),
    description: asNullableString(object.description, "description")
  };
}
function parsePrice(value) {
  const object = asObject(value, "Price");
  assertExactKeys(
    object,
    ["id", "productId", "unitAmount", "currency", "type", "recurring", "description", "lookupKey"],
    "Price"
  );
  const type = asString(object.type, "type");
  if (type !== "one_time" && type !== "recurring") throw new TypeError("Price type is invalid");
  if (!Number.isSafeInteger(object.unitAmount) || Number(object.unitAmount) < 0) {
    throw new TypeError("unitAmount must be a non-negative safe integer");
  }
  return {
    id: asString(object.id, "id"),
    productId: asString(object.productId, "productId"),
    unitAmount: Number(object.unitAmount),
    currency: asString(object.currency, "currency"),
    type,
    recurring: parseRecurring(object.recurring, type),
    description: asNullableString(object.description, "description"),
    lookupKey: asNullableString(object.lookupKey, "lookupKey")
  };
}
function parseRecurring(value, type) {
  if (type === "one_time") {
    if (value !== null) throw new TypeError("One-time price recurring value must be null");
    return null;
  }
  const object = asObject(value, "Recurring price");
  assertExactKeys(object, ["interval", "intervalCount"], "Recurring price");
  const interval = asString(object.interval, "interval");
  if (!["day", "week", "month", "year"].includes(interval)) {
    throw new TypeError("Recurring interval is invalid");
  }
  if (!Number.isSafeInteger(object.intervalCount) || Number(object.intervalCount) < 1) {
    throw new TypeError("intervalCount must be a positive safe integer");
  }
  return {
    interval,
    intervalCount: Number(object.intervalCount)
  };
}

// src/checkout/validation.ts
var checkoutStatuses = /* @__PURE__ */ new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "expired",
  "cancelled"
]);
function parseCreateCheckoutInput(value) {
  const object = asObject(value, "Checkout input");
  assertExactKeys(object, ["priceId", "email", "quantity", "destinationKey"], "Checkout input");
  const priceId = asString(object.priceId, "priceId").trim();
  const email = asString(object.email, "email").trim();
  const destinationKey = asString(object.destinationKey, "destinationKey");
  if (!priceId || priceId.length > 255) throw new TypeError("priceId is invalid");
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError("email is invalid");
  }
  if (!Number.isInteger(object.quantity) || Number(object.quantity) < 1 || Number(object.quantity) > 100) {
    throw new TypeError("quantity must be an integer from 1 to 100");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(destinationKey)) {
    throw new TypeError("destinationKey is invalid");
  }
  return { priceId, email, quantity: Number(object.quantity), destinationKey };
}
function parseCheckoutCreated(value) {
  const object = asObject(value, "Checkout");
  const keys = [
    "reference",
    "type",
    "status",
    "presentationVersion",
    "presentation",
    "createdAt",
    "expiresAt"
  ];
  if ("checkoutUrl" in object) keys.push("checkoutUrl");
  assertExactKeys(object, keys, "Checkout");
  const presentation = parsePresentation(object.presentation);
  if (object.status !== "pending" || object.presentationVersion !== 1) {
    throw new TypeError("Checkout status or presentation version is invalid");
  }
  const checkoutUrl = object.checkoutUrl;
  if (presentation.kind === "redirect" && checkoutUrl !== presentation.url) {
    throw new TypeError("checkoutUrl must match redirect presentation URL");
  }
  if (presentation.kind === "modal" && checkoutUrl !== void 0) {
    throw new TypeError("checkoutUrl is redirect-only");
  }
  return {
    reference: asString(object.reference, "reference"),
    type: parseCheckoutType(object.type),
    status: "pending",
    presentationVersion: 1,
    presentation,
    ...checkoutUrl === void 0 ? {} : { checkoutUrl: asString(checkoutUrl, "checkoutUrl") },
    createdAt: parseDate(object.createdAt, "createdAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt")
  };
}
function parseCheckoutLifecycle(value) {
  const object = asObject(value, "Checkout lifecycle");
  assertExactKeys(
    object,
    ["reference", "type", "status", "createdAt", "updatedAt", "expiresAt"],
    "Checkout lifecycle"
  );
  const status = asString(object.status, "status");
  if (!checkoutStatuses.has(status)) throw new TypeError("Checkout status is invalid");
  return {
    reference: asString(object.reference, "reference"),
    type: parseCheckoutType(object.type),
    status,
    createdAt: parseDate(object.createdAt, "createdAt"),
    updatedAt: parseDate(object.updatedAt, "updatedAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt")
  };
}
function parsePresentation(value) {
  const object = asObject(value, "Checkout presentation");
  if (object.kind === "redirect") {
    assertExactKeys(object, ["kind", "url"], "Redirect presentation");
    return { kind: "redirect", url: asString(object.url, "url") };
  }
  if (object.kind !== "modal") throw new TypeError("Checkout presentation kind is invalid");
  assertExactKeys(object, ["kind", "script", "configuration", "callback"], "Modal presentation");
  return parseModal(object);
}
function parseModal(object) {
  const script = asObject(object.script, "Modal script");
  assertExactKeys(script, ["url"], "Modal script");
  if (script.url !== "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js") {
    throw new TypeError("Modal script is not allowlisted");
  }
  const configuration = asObject(object.configuration, "Modal configuration");
  assertExactKeys(
    configuration,
    ["sessionToken", "amount", "currency", "reference"],
    "Modal configuration"
  );
  if (!Number.isSafeInteger(configuration.amount) || Number(configuration.amount) < 1) {
    throw new TypeError("Modal amount is invalid");
  }
  const sessionToken = asString(configuration.sessionToken, "sessionToken");
  const reference = asString(configuration.reference, "reference");
  if (!sessionToken || sessionToken.length > 4096 || !reference || reference.length > 255) {
    throw new TypeError("Modal configuration is invalid");
  }
  const currency = asString(configuration.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("Modal currency is invalid");
  const callback = asObject(object.callback, "Modal callback");
  assertExactKeys(callback, ["url", "token"], "Modal callback");
  const callbackUrl = asString(callback.url, "callback.url");
  const callbackToken = asString(callback.token, "token");
  if (!/^\/public\/v1\/checkouts\/[A-Za-z0-9_-]+\/callback$/.test(callbackUrl)) {
    throw new TypeError("Modal callback URL is invalid");
  }
  if (!callbackToken || callbackToken.length > 4096) {
    throw new TypeError("Modal callback token is invalid");
  }
  return {
    kind: "modal",
    script: { url: script.url },
    configuration: {
      sessionToken,
      amount: Number(configuration.amount),
      currency,
      reference
    },
    callback: {
      url: callbackUrl,
      token: callbackToken
    }
  };
}
function parseCheckoutType(value) {
  if (value !== "payment" && value !== "subscription")
    throw new TypeError("Checkout type is invalid");
  return value;
}
function parseDate(value, field) {
  const date = asString(value, field);
  if (Number.isNaN(Date.parse(date))) throw new TypeError(`${field} must be an ISO date-time`);
  return date;
}

// src/checkout/client.ts
function createCheckoutClient(http) {
  return {
    async create(input, options = {}) {
      const body = parseCreateCheckoutInput(input);
      const idempotencyKey = options.idempotencyKey ?? generateIdempotencyKey();
      assertIdempotencyKey(idempotencyKey);
      const value = await http.request("public/v1/checkouts", {
        method: "POST",
        body,
        idempotencyKey,
        ...options.signal ? { signal: options.signal } : {}
      });
      return parseCheckoutCreated(value);
    },
    async getStatus(reference, options = {}) {
      if (!reference) throw new TypeError("Checkout reference must not be empty");
      const value = await http.request(`public/v1/checkouts/${encodeURIComponent(reference)}`, {
        ...options.signal ? { signal: options.signal } : {}
      });
      return parseCheckoutLifecycle(value);
    },
    redirect(checkout, navigate = defaultNavigate) {
      if (checkout.presentation.kind !== "redirect") {
        throw new TypeError("Checkout presentation is not a redirect");
      }
      const url = new URL(checkout.presentation.url);
      if (url.protocol !== "https:") throw new TypeError("Checkout redirect must use HTTPS");
      navigate(url.href);
    }
  };
}
function generateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("crypto.randomUUID is required to generate an idempotency key");
  }
  return globalThis.crypto.randomUUID();
}
function assertIdempotencyKey(value) {
  if (value.length < 16 || value.length > 200 || !/^[!-~]+$/.test(value)) {
    throw new TypeError("Idempotency key must be 16 to 200 printable ASCII characters");
  }
}
function defaultNavigate(url) {
  globalThis.location.assign(url);
}

// src/core/config.ts
function parseClientConfig(input) {
  if (!input.publishableKey.trim()) {
    throw new TypeError("Publishable key must not be empty");
  }
  let apiBaseUrl;
  try {
    apiBaseUrl = new URL(input.apiBaseUrl);
  } catch {
    throw new TypeError("API base URL must be an absolute HTTP or HTTPS URL");
  }
  if (!["http:", "https:"].includes(apiBaseUrl.protocol) || apiBaseUrl.username || apiBaseUrl.password || apiBaseUrl.search || apiBaseUrl.hash) {
    throw new TypeError("API base URL must not contain credentials, query, or fragment");
  }
  const loopbackHosts = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (apiBaseUrl.protocol === "http:" && !loopbackHosts.has(apiBaseUrl.hostname)) {
    throw new TypeError("API base URL must use HTTPS or loopback HTTP");
  }
  if (!apiBaseUrl.pathname.endsWith("/")) {
    apiBaseUrl.pathname += "/";
  }
  return { publishableKey: input.publishableKey, apiBaseUrl };
}
function apiUrl(baseUrl, path) {
  return new URL(path.replace(/^\//, ""), baseUrl);
}

// src/errors.ts
var BuPaymentError = class extends Error {
  code;
  status;
  requestId;
  constructor(message, options) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
  }
  toJSON() {
    return { name: this.name, code: this.code, status: this.status, requestId: this.requestId };
  }
};
var SessionMalformedError = class extends BuPaymentError {
};
var SessionInvalidError = class extends BuPaymentError {
};
var SessionExpiredError = class extends BuPaymentError {
};
var SessionRotatedError = class extends BuPaymentError {
};
var CapabilityDeniedError = class extends BuPaymentError {
};
var RateLimitedError = class extends BuPaymentError {
};
var ValidationError = class extends BuPaymentError {
};
var NotFoundError = class extends BuPaymentError {
};
var IdempotencyConflictError = class extends BuPaymentError {
};
var CheckoutDestinationUnavailableError = class extends BuPaymentError {
};
var CheckoutLiveNotEnabledError = class extends BuPaymentError {
};
var CheckoutProviderFailedError = class extends BuPaymentError {
};
var CheckoutUnavailableError = class extends BuPaymentError {
};
var SessionUnavailableError = class extends BuPaymentError {
};
var CatalogueUnavailableError = class extends BuPaymentError {
};
var errorTypes = {
  application_session_malformed: SessionMalformedError,
  application_session_invalid: SessionInvalidError,
  application_session_expired: SessionExpiredError,
  application_session_rotated: SessionRotatedError,
  application_capability_denied: CapabilityDeniedError,
  application_rate_limited: RateLimitedError,
  application_session_unavailable: SessionUnavailableError,
  invalid_request: ValidationError,
  not_found: NotFoundError,
  idempotency_conflict: IdempotencyConflictError,
  checkout_destination_unavailable: CheckoutDestinationUnavailableError,
  checkout_live_not_enabled: CheckoutLiveNotEnabledError,
  checkout_provider_failed: CheckoutProviderFailedError,
  checkout_unavailable: CheckoutUnavailableError,
  catalogue_unavailable: CatalogueUnavailableError
};
async function errorFromResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    return new BuPaymentError(`BuPayment request failed with HTTP ${response.status}`, {
      code: "invalid_error_response",
      status: response.status,
      cause
    });
  }
  try {
    const object = asObject(body, "Error");
    const code = asString(object.error, "error");
    const message = Array.isArray(object.message) ? object.message.map((item) => asString(item, "message")).join("; ") : asString(object.message, "message");
    const ErrorType = errorTypes[code] ?? BuPaymentError;
    return new ErrorType(message, {
      code,
      status: response.status,
      requestId: typeof object.requestId === "string" ? object.requestId : void 0
    });
  } catch (cause) {
    return new BuPaymentError(`BuPayment request failed with HTTP ${response.status}`, {
      code: "invalid_error_response",
      status: response.status,
      cause
    });
  }
}

// src/core/retry.ts
var retryableStatuses = /* @__PURE__ */ new Set([429, 502, 503, 504]);
function createRetryPolicy(options = {}) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
  const sleep = options.sleep ?? wait;
  return {
    async run(context, operation) {
      const safeToRetry = context.method === "GET" || context.hasIdempotencyKey;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;
        try {
          response = await operation();
        } catch (error) {
          if (!safeToRetry || attempt === maxAttempts || isAbort(error, context.signal))
            throw error;
          await sleep(baseDelayMs * 2 ** (attempt - 1), context.signal);
          continue;
        }
        if (!safeToRetry || !retryableStatuses.has(response.status) || attempt === maxAttempts) {
          return response;
        }
        await sleep(retryDelay(response, baseDelayMs * 2 ** (attempt - 1)), context.signal);
      }
      throw new Error("Retry policy exhausted unexpectedly");
    }
  };
}
function retryDelay(response, fallback) {
  const header = response.headers.get("Retry-After");
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1e3, 3e4);
  const dateDelay = Date.parse(header) - Date.now();
  return Number.isFinite(dateDelay) && dateDelay > 0 ? Math.min(dateDelay, 3e4) : fallback;
}
function isAbort(error, signal) {
  return signal?.aborted === true || error instanceof DOMException && error.name === "AbortError";
}
function wait(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

// src/core/http.ts
function createHttpClient(options) {
  const retry = options.retry ?? createRetryPolicy();
  return {
    async request(path, request = {}) {
      const method = request.method ?? "GET";
      const send = async (token2) => {
        const headers = { "Bu-Payment-Session": token2 };
        if (request.body !== void 0) headers["Content-Type"] = "application/json";
        if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;
        const response = await retry.run(
          { method, hasIdempotencyKey: Boolean(request.idempotencyKey), signal: request.signal },
          () => options.fetch(apiUrl(options.config.apiBaseUrl, path), {
            method,
            headers,
            ...request.body === void 0 ? {} : { body: JSON.stringify(request.body) },
            ...request.signal ? { signal: request.signal } : {}
          })
        );
        if (!response.ok) throw await errorFromResponse(response);
        return response.json();
      };
      const token = await options.sessions.getToken(request.signal);
      try {
        return await send(token);
      } catch (error) {
        if (!(error instanceof SessionExpiredError || error instanceof SessionRotatedError))
          throw error;
        options.sessions.invalidate(token);
        return send(await options.sessions.getToken(request.signal));
      }
    }
  };
}

// src/session/session-manager.ts
function createSessionManager(options) {
  let session;
  let pending;
  async function issue(signal) {
    const response = await options.fetch(
      apiUrl(options.config.apiBaseUrl, "public/v1/application-sessions"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishableKey: options.config.publishableKey }),
        ...{}
      }
    );
    if (!response.ok) throw await errorFromResponse(response);
    return parseSession(await response.json());
  }
  async function renew(current, signal) {
    const response = await options.fetch(
      apiUrl(options.config.apiBaseUrl, "public/v1/application-sessions/renew"),
      {
        method: "POST",
        headers: { "Bu-Payment-Session": current.token },
        ...{}
      }
    );
    if (!response.ok) throw await errorFromResponse(response);
    return parseSession(await response.json());
  }
  async function refresh(signal) {
    if (!session) return issue();
    try {
      return await renew(session, signal);
    } catch (error) {
      if (error instanceof SessionRotatedError || error instanceof SessionExpiredError) {
        session = void 0;
        return issue();
      }
      throw error;
    }
  }
  return {
    async getToken(signal) {
      if (session && options.now().getTime() < Date.parse(session.renewAfter)) return session.token;
      pending ??= refresh().finally(() => {
        pending = void 0;
      });
      session = await waitForCaller(pending, signal);
      return session.token;
    },
    invalidate(token) {
      if (session?.token === token) session = void 0;
    }
  };
}
function waitForCaller(promise, signal) {
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
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
function parseSession(value) {
  const object = asObject(value, "Application session");
  assertExactKeys(
    object,
    ["token", "expiresAt", "renewAfter", "capabilities"],
    "Application session"
  );
  if (!Array.isArray(object.capabilities)) throw new TypeError("capabilities must be an array");
  const capabilities = object.capabilities.map((value2) => asString(value2, "capability"));
  if (capabilities.some((value2) => value2 !== "catalogue:read" && value2 !== "checkout:create")) {
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
    capabilities
  };
}

// src/client.ts
function createBuPaymentClient(options) {
  const config = parseClientConfig(options);
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") throw new TypeError("A Fetch API implementation is required");
  const sessions = createSessionManager({ config, fetch, now: options.now ?? (() => /* @__PURE__ */ new Date()) });
  const http = createHttpClient({ config, fetch, sessions });
  return { catalogue: createCatalogueClient(http), checkout: createCheckoutClient(http) };
}

export { BuPaymentError, CapabilityDeniedError, CatalogueUnavailableError, CheckoutDestinationUnavailableError, CheckoutLiveNotEnabledError, CheckoutProviderFailedError, CheckoutUnavailableError, IdempotencyConflictError, NotFoundError, RateLimitedError, SessionExpiredError, SessionInvalidError, SessionMalformedError, SessionRotatedError, SessionUnavailableError, ValidationError, createBuPaymentClient };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map