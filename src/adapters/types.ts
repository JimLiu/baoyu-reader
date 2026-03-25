import type { BrowserSession } from "../browser/session";
import type { CdpClient } from "../browser/cdp-client";
import type { NetworkJournal } from "../browser/network-journal";
import type { ExtractedDocument } from "../extract/document";
import type { Logger } from "../utils/logger";

export interface AdapterInput {
  url: URL;
}

export type LoginState = "logged_in" | "logged_out" | "unknown";
export type InteractionKind = "login" | "cloudflare" | "recaptcha" | "hcaptcha" | "captcha" | "challenge";

export interface AdapterLoginInfo {
  provider: string;
  state: LoginState;
  required?: boolean;
  username?: string;
  reason?: string;
}

export interface WaitForInteractionRequest {
  type: "wait_for_interaction";
  kind: InteractionKind;
  provider: string;
  prompt: string;
  reason?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requiresVisibleBrowser?: boolean;
}

export type AdapterProcessResult =
  | {
      status: "ok";
      document: ExtractedDocument;
      login?: AdapterLoginInfo;
    }
  | {
      status: "needs_interaction";
      interaction: WaitForInteractionRequest;
      login?: AdapterLoginInfo;
    }
  | {
      status: "no_document";
      login?: AdapterLoginInfo;
    };

export interface AdapterContext {
  input: AdapterInput;
  browser: BrowserSession;
  network: NetworkJournal;
  cdp: CdpClient;
  log: Logger;
  timeoutMs: number;
  interactive: boolean;
}

export interface Adapter {
  name: string;
  match(input: AdapterInput): boolean;
  checkLogin?(context: AdapterContext): Promise<AdapterLoginInfo>;
  process(context: AdapterContext): Promise<AdapterProcessResult>;
}
