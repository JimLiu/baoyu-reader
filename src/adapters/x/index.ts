import type { Adapter, AdapterContext, AdapterLoginInfo, AdapterProcessResult } from "../types";
import { detectInteractionGate } from "../../browser/interaction-gates";
import { extractStatusId, isXHost } from "./match";
import { extractArticleDocumentFromPayload } from "./article";
import { extractSingleTweetDocumentFromPayload } from "./single";
import { extractThreadDocumentFromPayloads, extractThreadTweetsFromPayloads } from "./thread";
import { filterXGraphQlEntries } from "./shared";

interface ClickTextResult {
  clicked: boolean;
  text?: string;
}

interface ScrollStepResult {
  moved: boolean;
  atTop: boolean;
  atBottom: boolean;
}

interface ThreadProgress {
  tweetCount: number;
  firstTweetId?: string;
  lastTweetId?: string;
  requestCount: number;
  tweetDetailCount: number;
}

interface TopProbeState {
  requestCount: number;
  tweetDetailCount: number;
  scrollHeight: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectJsonPayloads(context: Parameters<Adapter["process"]>[0]): Promise<unknown[]> {
  await prefetchRelevantXThreadBodies(context);
  const entries = getRelevantXThreadEntries(context);

  const payloads: unknown[] = [];
  for (const entry of entries) {
    const payload = await context.network.getJsonBody(entry);
    if (payload) {
      payloads.push(payload);
    }
  }
  return payloads;
}

function getRelevantXThreadEntries(context: AdapterContext) {
  return filterXGraphQlEntries(context.network.getEntries()).filter(
    (entry) =>
      entry.method === "GET" &&
      entry.finished &&
      (
        entry.url.includes("TweetDetail") ||
        entry.url.includes("TweetResultByRestId") ||
        entry.url.includes("TweetResultsByRestIds")
      ),
  );
}

async function prefetchRelevantXThreadBodies(context: AdapterContext): Promise<void> {
  const entries = getRelevantXThreadEntries(context).filter((entry) => entry.body === undefined && !entry.bodyError);
  for (const entry of entries) {
    await context.network.ensureBody(entry);
  }
}

async function waitForXNetworkSettle(context: AdapterContext, reason: string): Promise<void> {
  try {
    await context.network.waitForIdle({
      idleMs: 650,
      timeoutMs: Math.min(context.timeoutMs, 5_000),
    });
  } catch {
    context.log.debug(`Network idle timed out after ${reason}.`);
  }
}

async function captureTopProbeState(context: AdapterContext): Promise<TopProbeState> {
  const entries = getRelevantXThreadEntries(context);
  const scrollHeight = await context.browser.evaluate<number>(`
    (() => {
      const scrollRoot = document.scrollingElement ?? document.documentElement ?? document.body;
      return scrollRoot.scrollHeight;
    })()
  `);

  return {
    requestCount: entries.length,
    tweetDetailCount: entries.filter((entry) => entry.url.includes("TweetDetail")).length,
    scrollHeight,
  };
}

async function waitForTopProbe(context: AdapterContext): Promise<boolean> {
  const initial = await captureTopProbeState(context);
  const deadline = Date.now() + 1_200;

  while (Date.now() < deadline) {
    try {
      await context.network.waitForIdle({
        idleMs: 250,
        timeoutMs: 350,
      });
    } catch {
      // Keep polling until the shorter top-probe budget expires.
    }

    await prefetchRelevantXThreadBodies(context);
    const next = await captureTopProbeState(context);
    if (
      next.requestCount > initial.requestCount ||
      next.tweetDetailCount > initial.tweetDetailCount ||
      next.scrollHeight > initial.scrollHeight + 4
    ) {
      context.log.debug("Observed additional X thread activity while probing the page top.");
      return true;
    }

    await sleep(120);
  }

  return false;
}

async function scrollThreadToTop(context: AdapterContext): Promise<void> {
  let settledTopChecks = 0;

  while (settledTopChecks < 2) {
    const scroll = await context.browser.evaluate<ScrollStepResult>(`
      (() => {
        const scrollRoot = document.scrollingElement ?? document.documentElement ?? document.body;
        const before = window.scrollY;
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        const after = window.scrollY;
        return {
          moved: after !== before,
          atTop: after <= 4,
          atBottom: window.innerHeight + after >= scrollRoot.scrollHeight - 4,
        };
      })()
    `);
    await sleep(140);
    await waitForXNetworkSettle(context, "scrolling X thread to top");
    await prefetchRelevantXThreadBodies(context);

    if (scroll.moved) {
      settledTopChecks = 0;
      continue;
    }

    const observedTopActivity = await waitForTopProbe(context);
    if (observedTopActivity) {
      settledTopChecks = 0;
      continue;
    }

    settledTopChecks += 1;
  }
}

async function clickVisibleShowReplies(context: AdapterContext): Promise<ClickTextResult> {
  return context.browser.evaluate<ClickTextResult>(`
    (() => {
      const normalize = (value) => value.replace(/\\s+/g, " ").trim();
      const matches = [
        /^Show replies$/i,
        /^Show more replies$/i,
        /^Show additional replies$/i,
        /^显示回复$/,
        /^展开回复$/,
      ];
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const selectors = [
        "a",
        "button",
        '[role="button"]',
        '[role="link"]',
      ];

      for (const element of document.querySelectorAll(selectors.join(","))) {
        if (!isVisible(element)) {
          continue;
        }
        const text = normalize(element.textContent ?? "");
        if (!text || !matches.some((pattern) => pattern.test(text))) {
          continue;
        }
        element.scrollIntoView({ block: "center", inline: "nearest" });
        if (element instanceof HTMLElement) {
          element.click();
          return { clicked: true, text };
        }
      }

      return { clicked: false };
    })()
  `);
}

async function expandVisibleShowReplies(context: AdapterContext): Promise<number> {
  let clickCount = 0;

  while (clickCount < 8) {
    const result = await clickVisibleShowReplies(context).catch<ClickTextResult>(() => ({ clicked: false }));
    if (!result.clicked) {
      break;
    }

    clickCount += 1;
    context.log.debug(`Expanded X thread replies via "${result.text ?? "Show replies"}".`);
    await sleep(250);
    await waitForXNetworkSettle(context, "expanding Show replies");
    await prefetchRelevantXThreadBodies(context);
  }

  return clickCount;
}

async function scrollThreadBy(context: AdapterContext, stepPx: number): Promise<ScrollStepResult> {
  const result = await context.browser.evaluate<ScrollStepResult>(`
    (() => {
      const scrollRoot = document.scrollingElement ?? document.documentElement ?? document.body;
      const before = window.scrollY;
      window.scrollBy({ top: ${stepPx}, left: 0, behavior: "instant" });
      const after = window.scrollY;
      return {
        moved: after !== before,
        atTop: after <= 4,
        atBottom: window.innerHeight + after >= scrollRoot.scrollHeight - 4,
      };
    })()
  `);

  await sleep(140);
  await waitForXNetworkSettle(context, "scrolling X thread");
  await prefetchRelevantXThreadBodies(context);
  return result;
}

async function scrollThreadDown(context: AdapterContext, stepPx = 720): Promise<ScrollStepResult> {
  return scrollThreadBy(context, stepPx);
}

async function captureThreadProgress(context: AdapterContext, statusId: string): Promise<ThreadProgress> {
  const entries = getRelevantXThreadEntries(context);
  const payloads = await collectJsonPayloads(context);
  const tweets = extractThreadTweetsFromPayloads(payloads, statusId, context.input.url.toString());
  return {
    tweetCount: tweets.length,
    firstTweetId: tweets[0]?.id,
    lastTweetId: tweets[tweets.length - 1]?.id,
    requestCount: entries.length,
    tweetDetailCount: entries.filter((entry) => entry.url.includes("TweetDetail")).length,
  };
}

async function loadFullXThread(context: AdapterContext, statusId: string): Promise<void> {
  await scrollThreadToTop(context);

  let progress = await captureThreadProgress(context, statusId);
  let stagnantRounds = 0;
  let roundsWithoutMovement = 0;
  let distanceWithoutThreadActivityPx = 0;

  for (let round = 0; ; round += 1) {
    const stepPx = round < 12 ? 1_200 : 1_600;
    let expandedCount = await expandVisibleShowReplies(context);
    const scroll = await scrollThreadDown(context, stepPx);
    expandedCount += await expandVisibleShowReplies(context);
    const nextProgress = await captureThreadProgress(context, statusId);
    const grew =
      nextProgress.tweetCount > progress.tweetCount ||
      nextProgress.firstTweetId !== progress.firstTweetId ||
      nextProgress.lastTweetId !== progress.lastTweetId ||
      nextProgress.requestCount > progress.requestCount ||
      nextProgress.tweetDetailCount > progress.tweetDetailCount;

    if (grew) {
      context.log.debug(
        `X thread progress: ${nextProgress.tweetCount} tweets (${nextProgress.firstTweetId ?? "unknown"} -> ${nextProgress.lastTweetId ?? "unknown"}), ${nextProgress.requestCount} requests, ${nextProgress.tweetDetailCount} TweetDetail.`,
      );
      stagnantRounds = 0;
      distanceWithoutThreadActivityPx = 0;
    } else if (expandedCount > 0) {
      stagnantRounds = 0;
      distanceWithoutThreadActivityPx = 0;
    } else {
      stagnantRounds += 1;
      distanceWithoutThreadActivityPx += stepPx;
    }

    roundsWithoutMovement = scroll.moved ? 0 : roundsWithoutMovement + 1;
    progress = nextProgress;

    if (scroll.atBottom && stagnantRounds >= 6) {
      context.log.debug("Stopping X thread scroll after reaching page bottom with no further thread progress.");
      break;
    }

    if (roundsWithoutMovement >= 2 && stagnantRounds >= 4) {
      context.log.debug("Stopping X thread scroll after repeated downward scrolls no longer move the page.");
      break;
    }

    if (distanceWithoutThreadActivityPx >= 24_000 && stagnantRounds >= 12) {
      context.log.debug("Stopping X thread scroll after a long stretch with no thread-related progress.");
      break;
    }
  }
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
      await prefetchRelevantXThreadBodies(context);
    } catch {
      context.log.debug("No tweet GraphQL response observed before timeout.");
    }

    await loadFullXThread(context, statusId);

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
