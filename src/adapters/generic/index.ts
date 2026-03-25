import type { Adapter } from "../types";
import { detectInteractionGate } from "../../browser/interaction-gates";
import { extractDocumentFromHtml } from "../../extract/html-extractor";

export const genericAdapter: Adapter = {
  name: "generic",
  match() {
    return true;
  },
  async process(context) {
    context.log.info(`Loading ${context.input.url.toString()} with generic adapter`);
    await context.browser.goto(context.input.url.toString(), context.timeoutMs);

    try {
      await context.network.waitForIdle({
        idleMs: 1_200,
        timeoutMs: Math.min(context.timeoutMs, 15_000),
      });
    } catch {
      context.log.debug("Network idle timed out on initial load; continuing.");
    }

    await context.browser.scrollToEnd({ maxSteps: 4, delayMs: 300 });

    try {
      await context.network.waitForIdle({
        idleMs: 900,
        timeoutMs: Math.min(context.timeoutMs, 10_000),
      });
    } catch {
      context.log.debug("Network idle timed out after scrolling; continuing.");
    }

    const [html, finalUrl] = await Promise.all([
      context.browser.getHTML(),
      context.browser.getURL(),
    ]);

    const interaction = await detectInteractionGate(context.browser);
    if (interaction) {
      return {
        status: "needs_interaction",
        interaction,
      };
    }

    const document = extractDocumentFromHtml({
      url: finalUrl,
      html,
      adapter: "generic",
    });

    return {
      status: "ok",
      document,
    };
  },
};
