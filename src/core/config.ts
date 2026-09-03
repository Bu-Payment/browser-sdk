export interface ClientConfigInput {
  publishableKey: string;
  apiBaseUrl: string;
}

export interface ClientConfig {
  publishableKey: string;
  apiBaseUrl: URL;
}

export function parseClientConfig(input: ClientConfigInput): ClientConfig {
  if (!input.publishableKey.trim()) {
    throw new TypeError("Publishable key must not be empty");
  }
  let apiBaseUrl: URL;
  try {
    apiBaseUrl = new URL(input.apiBaseUrl);
  } catch {
    throw new TypeError("API base URL must be an absolute HTTP or HTTPS URL");
  }
  if (
    !["http:", "https:"].includes(apiBaseUrl.protocol) ||
    apiBaseUrl.username ||
    apiBaseUrl.password ||
    apiBaseUrl.search ||
    apiBaseUrl.hash
  ) {
    throw new TypeError("API base URL must not contain credentials, query, or fragment");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (apiBaseUrl.protocol === "http:" && !loopbackHosts.has(apiBaseUrl.hostname)) {
    throw new TypeError("API base URL must use HTTPS or loopback HTTP");
  }
  if (!apiBaseUrl.pathname.endsWith("/")) {
    apiBaseUrl.pathname += "/";
  }
  return { publishableKey: input.publishableKey, apiBaseUrl };
}

export function apiUrl(baseUrl: URL, path: string): URL {
  return new URL(path.replace(/^\//, ""), baseUrl);
}
