import type { BrowserSession } from "../browser/session";
import type { CdpClient } from "../browser/cdp-client";
import type { NetworkJournal } from "../browser/network-journal";
import type { ExtractedDocument } from "../extract/document";
import type { Logger } from "../utils/logger";

export interface AdapterInput {
  url: URL;
}

export interface AdapterContext {
  input: AdapterInput;
  browser: BrowserSession;
  network: NetworkJournal;
  cdp: CdpClient;
  log: Logger;
  timeoutMs: number;
}

export interface Adapter {
  name: string;
  match(input: AdapterInput): boolean;
  process(context: AdapterContext): Promise<ExtractedDocument | null>;
}

