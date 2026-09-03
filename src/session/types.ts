export type BrowserCapability = "catalogue:read" | "checkout:create";

export interface BrowserApplicationSession {
  token: string;
  expiresAt: string;
  renewAfter: string;
  capabilities: BrowserCapability[];
}
