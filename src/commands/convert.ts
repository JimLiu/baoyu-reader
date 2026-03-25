import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { connectChrome, type ChromeConnection } from "../browser/chrome-launcher";
import { CdpClient } from "../browser/cdp-client";
import { detectInteractionGate } from "../browser/interaction-gates";
import { NetworkJournal } from "../browser/network-journal";
import { BrowserSession } from "../browser/session";
import { genericAdapter, resolveAdapter } from "../adapters";
import type { ExtractedDocument } from "../extract/document";
import { renderMarkdown } from "../extract/markdown-renderer";
import { createLogger } from "../utils/logger";
import { normalizeUrl } from "../utils/url";
import type {
  Adapter,
  AdapterContext,
  AdapterLoginInfo,
  LoginState,
  WaitForInteractionRequest,
} from "../adapters/types";

export type WaitMode = "none" | "interaction" | "force";

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
  waitMode: WaitMode;
  interactionTimeoutMs: number;
  interactionPollIntervalMs: number;
  timeoutMs: number;
}

interface RuntimeResources {
  chrome: ChromeConnection;
  cdp: CdpClient;
  browser: BrowserSession;
  network: NetworkJournal;
  interactive: boolean;
}

interface ForceWaitSnapshot {
  url: string;
  hasGate: boolean;
  loginState: LoginState | "unavailable";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldAutoContinueForceWait(
  initial: ForceWaitSnapshot,
  current: ForceWaitSnapshot,
): boolean {
  if (initial.hasGate && !current.hasGate) {
    return true;
  }

  if (initial.loginState === "logged_out" && current.loginState !== "logged_out") {
    return true;
  }

  if (initial.loginState !== "logged_in" && current.loginState === "logged_in") {
    return true;
  }

  if (current.url !== initial.url && !current.hasGate && current.loginState !== "logged_out") {
    return true;
  }

  return false;
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

async function openRuntime(
  options: ConvertCommandOptions,
  interactive: boolean,
  debugEnabled: boolean,
): Promise<RuntimeResources> {
  const logger = createLogger(debugEnabled);
  if (interactive) {
    logger.info("Opening Chrome in interactive mode.");
  }
  const chrome = await connectChrome({
    cdpUrl: options.cdpUrl,
    browserPath: options.browserPath,
    profileDir: options.chromeProfileDir,
    headless: interactive ? false : options.headless,
    logger,
  });

  const cdp = await CdpClient.connect(chrome.browserWsUrl);
  const browser = await BrowserSession.open(cdp, { interactive });
  if (interactive) {
    await browser.bringToFront().catch(() => {});
  }
  const network = new NetworkJournal(browser.targetSession, logger);
  await network.start();

  return {
    chrome,
    cdp,
    browser,
    network,
    interactive,
  };
}

async function closeRuntime(runtime: RuntimeResources | null | undefined): Promise<void> {
  if (!runtime) {
    return;
  }
  runtime.network.stop();
  await runtime.browser.close().catch(() => {});
  await runtime.cdp.close().catch(() => {});
  await runtime.chrome.close().catch(() => {});
}

async function reopenInteractiveRuntime(
  runtime: RuntimeResources,
  options: ConvertCommandOptions,
  debugEnabled: boolean,
): Promise<RuntimeResources> {
  if (runtime.interactive) {
    return runtime;
  }

  await closeRuntime(runtime);
  return openRuntime(options, true, debugEnabled);
}

async function captureForceWaitSnapshot(
  adapter: Adapter,
  context: AdapterContext,
): Promise<ForceWaitSnapshot> {
  const [gate, url, login] = await Promise.all([
    detectInteractionGate(context.browser).catch(() => null),
    context.browser.getURL().catch(() => context.input.url.toString()),
    adapter.checkLogin?.(context).catch(() => ({
      provider: adapter.name,
      state: "unknown" as const,
    })),
  ]);

  return {
    url,
    hasGate: Boolean(gate),
    loginState: login?.state ?? "unavailable",
  };
}

async function waitForForceResume(
  adapter: Adapter,
  context: AdapterContext,
  options: ConvertCommandOptions,
): Promise<void> {
  if (context.interactive) {
    await context.browser.bringToFront().catch(() => {});
  }

  const prompt =
    "Chrome is ready. Complete any manual login or verification. Extraction will continue automatically after it detects progress, or press Enter to continue immediately.";
  context.log.info(prompt);

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  let manualContinue = false;
  let closed = false;
  const closeReadline = (): void => {
    if (!closed) {
      closed = true;
      rl.close();
    }
  };

  rl.once("line", () => {
    manualContinue = true;
    closeReadline();
  });

  const initial = await captureForceWaitSnapshot(adapter, context);
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < options.interactionTimeoutMs) {
      if (manualContinue) {
        return;
      }

      const current = await captureForceWaitSnapshot(adapter, context);
      if (shouldAutoContinueForceWait(initial, current)) {
        return;
      }

      await sleep(options.interactionPollIntervalMs);
    }
  } finally {
    closeReadline();
  }

  throw new Error("Timed out waiting for force-mode interaction to complete");
}

async function waitForInteraction(
  adapter: Adapter,
  context: AdapterContext,
  interaction: WaitForInteractionRequest,
  options: ConvertCommandOptions,
): Promise<AdapterLoginInfo> {
  const timeoutMs = interaction.timeoutMs ?? options.interactionTimeoutMs;
  const pollIntervalMs = interaction.pollIntervalMs ?? options.interactionPollIntervalMs;
  if (context.interactive) {
    await context.browser.bringToFront().catch(() => {});
  }
  context.log.info(interaction.prompt);

  const startedAt = Date.now();
  let lastLogin: AdapterLoginInfo | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (interaction.kind === "login" && adapter.checkLogin) {
      lastLogin = await adapter.checkLogin(context);
      if (lastLogin.state === "logged_in") {
        return lastLogin;
      }
    }

    const gate = await detectInteractionGate(context.browser);
    if (!gate) {
      if (interaction.kind !== "login") {
        return lastLogin ?? {
          provider: interaction.provider,
          state: "unknown",
          reason: `${interaction.provider} challenge cleared`,
        };
      }

      if (!adapter.checkLogin) {
        return {
          provider: interaction.provider,
          state: "unknown",
        };
      }

      lastLogin = await adapter.checkLogin(context);
      if (lastLogin.state !== "logged_out") {
        return lastLogin;
      }
    }
    await sleep(pollIntervalMs);
  }

  const reason = lastLogin?.reason ? ` (${lastLogin.reason})` : "";
  throw new Error(`Timed out waiting for ${interaction.provider} interaction${reason}`);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runConvertCommand(options: ConvertCommandOptions): Promise<void> {
  if (!options.url) {
    throw new Error("URL is required");
  }

  const url = normalizeUrl(options.url);
  let runtime = await openRuntime(options, options.waitMode !== "none", Boolean(options.debugDir));
  const logger = createLogger(Boolean(options.debugDir));

  try {
    const adapter = resolveAdapter({ url }, options.adapter);
    let context: AdapterContext = {
      input: { url },
      browser: runtime.browser,
      network: runtime.network,
      cdp: runtime.cdp,
      log: logger,
      timeoutMs: options.timeoutMs,
      interactive: runtime.interactive,
    };

    if (options.waitMode === "force") {
      await context.browser.goto(url.toString(), options.timeoutMs).catch(() => {});
      await waitForForceResume(adapter, context, options);
    }

    let result = await adapter.process(context);

    if (result.status === "no_document") {
      const interaction = await detectInteractionGate(context.browser);
      if (interaction) {
        result = {
          status: "needs_interaction",
          interaction,
          login: result.login,
        };
      }
    }

    while (result.status === "needs_interaction") {
      if (options.waitMode === "none") {
        if (options.json) {
          printJson({
            adapter: adapter.name,
            status: result.status,
            login: result.login,
            interaction: result.interaction,
          });
          return;
        }

        throw new Error(`${adapter.name} requires manual interaction. Re-run with --wait-for interaction to continue after completing it.`);
      }

      if (result.interaction.requiresVisibleBrowser !== false) {
        runtime = await reopenInteractiveRuntime(runtime, options, Boolean(options.debugDir));
      }

      context = {
        input: { url },
        browser: runtime.browser,
        network: runtime.network,
        cdp: runtime.cdp,
        log: logger,
        timeoutMs: options.timeoutMs,
        interactive: runtime.interactive,
      };

      await context.browser.goto(url.toString(), options.timeoutMs).catch(() => {});
      await waitForInteraction(adapter, context, result.interaction, options);
      result = await adapter.process(context);

      if (result.status === "no_document") {
        const interaction = await detectInteractionGate(context.browser);
        if (interaction) {
          result = {
            status: "needs_interaction",
            interaction,
            login: result.login,
          };
        }
      }
    }

    let document: ExtractedDocument | null = result.status === "ok" ? result.document : null;
    let login = result.login;

    if (!document && adapter.name !== genericAdapter.name && result.status === "no_document") {
      logger.info(`Adapter ${adapter.name} returned no structured document; falling back to generic extraction`);
      const fallback = await genericAdapter.process(context);
      if (fallback.status === "ok") {
        document = fallback.document;
      }
    }

    if (!document) {
      throw new Error("Failed to extract a document from the target URL");
    }

    document.requestedUrl ??= url.toString();

    const markdown = renderMarkdown(document);

    if (options.output) {
      await writeOutput(options.output, markdown);
      logger.info(`Saved markdown to ${options.output}`);
    }

    if (options.debugDir) {
      await writeDebugArtifacts(options.debugDir, document, markdown, runtime.browser, runtime.network);
      logger.info(`Wrote debug artifacts to ${options.debugDir}`);
    }

    if (options.json) {
      printJson({
        adapter: document.adapter ?? adapter.name,
        status: "ok",
        login,
        document,
        markdown,
      });
      return;
    }

    console.log(markdown);
  } finally {
    await closeRuntime(runtime);
  }
}
