import type { Adapter } from "../types";
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

export const xAdapter: Adapter = {
  name: "x",
  match(input) {
    return isXHost(input.url.hostname);
  },
  async process(context) {
    const statusId = extractStatusId(context.input.url);
    if (!statusId) {
      return null;
    }

    context.log.info(`Loading ${context.input.url.toString()} with x adapter`);
    await context.browser.goto(context.input.url.toString(), context.timeoutMs);

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
    const payloads = await collectJsonPayloads(context);
    if (payloads.length === 0) {
      return null;
    }

    for (const payload of payloads) {
      const articleDocument = extractArticleDocumentFromPayload(payload, statusId, pageUrl, payloads);
      if (articleDocument) {
        return articleDocument;
      }
    }

    const threadDocument = extractThreadDocumentFromPayloads(payloads, statusId, pageUrl);
    if (threadDocument) {
      return threadDocument;
    }

    for (const payload of payloads) {
      const singleDocument = extractSingleTweetDocumentFromPayload(payload, statusId, pageUrl);
      if (singleDocument) {
        return singleDocument;
      }
    }

    return null;
  },
};
