import type { Adapter, AdapterContext, AdapterLoginInfo, AdapterProcessResult } from "../types";
import { detectInteractionGate } from "../../browser/interaction-gates";
import { extractStatusId, isXHost } from "./match";
import { extractArticleDocumentFromPayload } from "./article";
import { extractSingleTweetDocumentFromPayload } from "./single";
import { extractThreadDocumentFromPayloads } from "./thread";
import { filterXGraphQlEntries } from "./shared";

async function collectJsonPayloads(context: Parameters<Adapter["process"]>[0]): Promise<unknown[]> {
  const entries = filterXGraphQlEntries(context.network.getEntries()).filter(
    (entry) =>
      entry.url.includes("TweetDetail") ||
      entry.url.includes("TweetResultByRestId") ||
      entry.url.includes("TweetResultsByRestIds"),
  );

  const payloads: unknown[] = [];
  for (const entry of entries) {
    const payload = await context.network.getJsonBody(entry);
    if (payload) {
      payloads.push(payload);
    }
  }
  return payloads;
}

interface XLoginSnapshot {
  currentUrl: string;
  hasAccountMenu: boolean;
  hasLoginInputs: boolean;
  bodyText: string;
}

async function detectXLogin(context: AdapterContext): Promise<AdapterLoginInfo> {
  const snapshot = await context.browser.evaluate<XLoginSnapshot>(`
    (() => {
      const bodyText = (document.body?.innerText ?? "").slice(0, 2500);
      return {
        currentUrl: window.location.href,
        hasAccountMenu: Boolean(
          document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"], [aria-label="Account menu"]'
          )
        ),
        hasLoginInputs: Boolean(
          document.querySelector(
            'input[name="text"], input[name="password"], input[autocomplete="username"], input[autocomplete="current-password"]'
          )
        ),
        bodyText,
      };
    })()
  `).catch(async () => ({
    currentUrl: await context.browser.getURL().catch(() => context.input.url.toString()),
    hasAccountMenu: false,
    hasLoginInputs: false,
    bodyText: "",
  }));

  if (
    /\/i\/flow\/login|\/login/i.test(snapshot.currentUrl) ||
    snapshot.hasLoginInputs ||
    /sign in to x|join x today|登录 x|注册 x|登录到 x/i.test(snapshot.bodyText)
  ) {
    return {
      provider: "x",
      state: "logged_out",
      required: true,
      reason: "X login page detected",
    };
  }

  if (snapshot.hasAccountMenu) {
    return {
      provider: "x",
      state: "logged_in",
    };
  }

  return {
    provider: "x",
    state: "unknown",
  };
}

function buildNeedsLoginResult(login: AdapterLoginInfo): AdapterProcessResult {
  return {
    status: "needs_interaction",
    login: {
      ...login,
      provider: "x",
      state: login.state === "logged_in" ? "unknown" : login.state,
      required: true,
    },
    interaction: {
      type: "wait_for_interaction",
      kind: "login",
      provider: "x",
      reason: login.reason,
      prompt: "Please sign in to X in the opened Chrome window. Extraction will continue automatically once login is detected.",
      requiresVisibleBrowser: true,
    },
  };
}

export const xAdapter: Adapter = {
  name: "x",
  match(input) {
    return isXHost(input.url.hostname);
  },
  async checkLogin(context) {
    return detectXLogin(context);
  },
  async process(context) {
    const statusId = extractStatusId(context.input.url);
    if (!statusId) {
      return {
        status: "no_document",
      };
    }

    context.log.info(`Loading ${context.input.url.toString()} with x adapter`);
    await context.browser.goto(context.input.url.toString(), context.timeoutMs);

    const interaction = await detectInteractionGate(context.browser);
    if (interaction) {
      return {
        status: "needs_interaction",
        interaction,
      };
    }

    let login = await detectXLogin(context);
    if (login.state === "logged_out") {
      return buildNeedsLoginResult(login);
    }

    try {
      await context.network.waitForResponse(
        (entry) =>
          entry.url.includes("/graphql/") &&
          (entry.url.includes("TweetDetail") || entry.url.includes("TweetResultByRestId")),
        { timeoutMs: Math.min(context.timeoutMs, 15_000) },
      );
    } catch {
      context.log.debug("No tweet GraphQL response observed before timeout.");
    }

    await context.browser.scrollToEnd({ maxSteps: 6, delayMs: 400 });

    try {
      await context.network.waitForIdle({
        idleMs: 1_000,
        timeoutMs: Math.min(context.timeoutMs, 8_000),
      });
    } catch {
      context.log.debug("Network idle timed out after loading X page.");
    }

    const pageUrl = await context.browser.getURL();
    const postLoadInteraction = await detectInteractionGate(context.browser);
    if (postLoadInteraction) {
      return {
        status: "needs_interaction",
        interaction: postLoadInteraction,
        login,
      };
    }

    login = await detectXLogin(context).catch(() => login);
    if (login.state === "logged_out") {
      return buildNeedsLoginResult(login);
    }

    const payloads = await collectJsonPayloads(context);
    if (payloads.length === 0) {
      return {
        status: "no_document",
        login,
      };
    }

    for (const payload of payloads) {
      const articleDocument = extractArticleDocumentFromPayload(payload, statusId, pageUrl, payloads);
      if (articleDocument) {
        return {
          status: "ok",
          document: articleDocument,
          login,
        };
      }
    }

    const threadDocument = extractThreadDocumentFromPayloads(payloads, statusId, pageUrl);
    if (threadDocument) {
      return {
        status: "ok",
        document: threadDocument,
        login,
      };
    }

    for (const payload of payloads) {
      const singleDocument = extractSingleTweetDocumentFromPayload(payload, statusId, pageUrl);
      if (singleDocument) {
        return {
          status: "ok",
          document: singleDocument,
          login,
        };
      }
    }

    return {
      status: "no_document",
      login,
    };
  },
};
