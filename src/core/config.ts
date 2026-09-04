import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export interface ClientConfigInput {
  publishableKey: string;
  apiBaseUrl: string;
}

export interface ClientConfig {
  publishableKey: string;
  apiBaseUrl: URL;
  environment: "test" | "live";
}

export function parseClientConfig(input: ClientConfigInput): ClientConfig {
  const publishableKey = input.publishableKey.trim();
  const keyMatch = /^bup_pk_(test|live)_[A-Za-z0-9_-]+$/u.exec(publishableKey);
  if (!keyMatch) throw invalidConfig("Publishable key format is invalid");
  const environment = keyMatch[1] as ClientConfig["environment"];
  let apiBaseUrl: URL;
  try {
    apiBaseUrl = new URL(input.apiBaseUrl);
  } catch (cause) {
    throw invalidConfig("API base URL must be an absolute HTTP or HTTPS URL", cause);
  }
  if (apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") {
    throw invalidConfig("API base URL must use HTTP or HTTPS");
  }
  if (apiBaseUrl.username || apiBaseUrl.password || apiBaseUrl.search || apiBaseUrl.hash) {
    throw invalidConfig("API base URL must not contain credentials, query, or fragment");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (apiBaseUrl.protocol === "http:" && !loopbackHosts.has(apiBaseUrl.hostname)) {
    throw invalidConfig("API base URL must use HTTPS or loopback HTTP");
  }
  const apiEnvironment = explicitApiEnvironment(apiBaseUrl);
  if (apiEnvironment && apiEnvironment !== environment) {
    throw invalidConfig("Publishable key and API environment do not match");
  }
  if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
  return { publishableKey, apiBaseUrl, environment };
}

export function apiUrl(baseUrl: URL, path: string): URL {
  return new URL(path.replace(/^\//, ""), baseUrl);
}

function explicitApiEnvironment(url: URL): ClientConfig["environment"] | undefined {
  const hostnameParts = url.hostname.toLowerCase().split(".").slice(0, -1);
  const pathParts = url.pathname.toLowerCase().split("/").filter(Boolean);
  const parts = new Set([...hostnameParts, ...pathParts]);
  if (parts.has("test") || parts.has("sandbox")) return "test";
  if (parts.has("live") || parts.has("production")) return "live";
  return undefined;
}

function invalidConfig(message: string, cause?: unknown): BuPaymentError {
  return new BuPaymentError(message, {
    code: ErrorCode.CONFIGURATION_INVALID,
    ...(cause === undefined ? {} : { cause }),
  });
}
