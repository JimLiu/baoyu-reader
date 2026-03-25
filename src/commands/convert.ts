import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connectChrome } from "../browser/chrome-launcher";
import { CdpClient } from "../browser/cdp-client";
import { NetworkJournal } from "../browser/network-journal";
import { BrowserSession } from "../browser/session";
import { genericAdapter, resolveAdapter } from "../adapters";
import type { ExtractedDocument } from "../extract/document";
import { renderMarkdown } from "../extract/markdown-renderer";
import { createLogger } from "../utils/logger";
import { normalizeUrl } from "../utils/url";

export interface ConvertCommandOptions {
  url?: string;
  output?: string;
  json: boolean;
  adapter?: string;
  debugDir?: string;
  cdpUrl?: string;
  browserPath?: string;
  chromeProfileDir?: string;
  headless: boolean;
  timeoutMs: number;
}

async function writeOutput(path: string, markdown: string): Promise<void> {
  const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (directory) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(path, markdown, "utf8");
}

async function writeDebugArtifacts(
  debugDir: string,
  document: ExtractedDocument,
  markdown: string,
  browser: BrowserSession,
  network: NetworkJournal,
): Promise<void> {
  await mkdir(debugDir, { recursive: true });

  const html = await browser.getHTML().catch(() => "");
  const networkDump = await network.toJSON({ includeBodies: true });

  await Promise.all([
    writeFile(join(debugDir, "document.json"), JSON.stringify(document, null, 2), "utf8"),
    writeFile(join(debugDir, "markdown.md"), markdown, "utf8"),
    writeFile(join(debugDir, "page.html"), html, "utf8"),
    writeFile(join(debugDir, "network.json"), JSON.stringify(networkDump, null, 2), "utf8"),
  ]);
}

export async function runConvertCommand(options: ConvertCommandOptions): Promise<void> {
  if (!options.url) {
    throw new Error("URL is required");
  }

  const url = normalizeUrl(options.url);
  const logger = createLogger(Boolean(options.debugDir));
  const chrome = await connectChrome({
    cdpUrl: options.cdpUrl,
    browserPath: options.browserPath,
    profileDir: options.chromeProfileDir,
    headless: options.headless,
    logger,
  });

  const cdp = await CdpClient.connect(chrome.browserWsUrl);
  const browser = await BrowserSession.open(cdp);
  const network = new NetworkJournal(browser.targetSession, logger);
  await network.start();

  try {
    const adapter = resolveAdapter({ url }, options.adapter);
    const context = {
      input: { url },
      browser,
      network,
      cdp,
      log: logger,
      timeoutMs: options.timeoutMs,
    };

    let document = await adapter.process(context);
    if (!document && adapter.name !== genericAdapter.name) {
      logger.info(`Adapter ${adapter.name} returned no structured document; falling back to generic extraction`);
      document = await genericAdapter.process(context);
    }

    if (!document) {
      throw new Error("Failed to extract a document from the target URL");
    }

    const markdown = renderMarkdown(document);

    if (options.output) {
      await writeOutput(options.output, markdown);
      logger.info(`Saved markdown to ${options.output}`);
    }

    if (options.debugDir) {
      await writeDebugArtifacts(options.debugDir, document, markdown, browser, network);
      logger.info(`Wrote debug artifacts to ${options.debugDir}`);
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            adapter: document.adapter ?? adapter.name,
            document,
            markdown,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(markdown);
  } finally {
    network.stop();
    await browser.close().catch(() => {});
    await cdp.close().catch(() => {});
    await chrome.close().catch(() => {});
  }
}
