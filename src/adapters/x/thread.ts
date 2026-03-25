import type { ExtractedDocument } from "../../extract/document";
import { formatMediaList, formatTweetAuthor, isRecord, normalizeTitle, toXTweet } from "./shared";
import type { JsonObject, XTweet } from "./types";

function extractTweetResult(node: unknown): JsonObject | null {
  if (!isRecord(node)) {
    return null;
  }

  const tweet = isRecord(node.tweet) ? (node.tweet as JsonObject) : node;
  if (typeof tweet.rest_id !== "string" || !isRecord(tweet.legacy)) {
    return null;
  }

  return tweet;
}

function parseTweetDetailPayload(payload: unknown, pageUrl: string): XTweet[] {
  if (!isRecord(payload)) {
    return [];
  }

  const seen = new Set<string>();
  const tweets: XTweet[] = [];

  const instructions =
    (isRecord(payload.data) &&
    isRecord(payload.data.threaded_conversation_with_injections_v2) &&
    Array.isArray(payload.data.threaded_conversation_with_injections_v2.instructions)
      ? payload.data.threaded_conversation_with_injections_v2.instructions
      : undefined) ??
    (isRecord(payload.data) &&
    isRecord(payload.data.tweetResult) &&
    isRecord(payload.data.tweetResult.result) &&
    isRecord(payload.data.tweetResult.result.timeline) &&
    Array.isArray(payload.data.tweetResult.result.timeline.instructions)
      ? payload.data.tweetResult.result.timeline.instructions
      : []);

  for (const instruction of instructions) {
    if (!isRecord(instruction) || !Array.isArray(instruction.entries)) {
      continue;
    }

    for (const entry of instruction.entries) {
      if (!isRecord(entry)) {
        continue;
      }

      const content = isRecord(entry.content) ? entry.content : {};
      const directTweet = extractTweetResult(
        isRecord(content.itemContent) && isRecord(content.itemContent.tweet_results)
          ? content.itemContent.tweet_results.result
          : null,
      );
      if (directTweet && !seen.has(String(directTweet.rest_id))) {
        seen.add(String(directTweet.rest_id));
        tweets.push(toXTweet(directTweet, pageUrl));
      }

      if (!Array.isArray(content.items)) {
        continue;
      }
      for (const item of content.items) {
        if (
          !isRecord(item) ||
          !isRecord(item.item) ||
          !isRecord(item.item.itemContent) ||
          !isRecord(item.item.itemContent.tweet_results)
        ) {
          continue;
        }
        const nestedTweet = extractTweetResult(item.item.itemContent.tweet_results.result);
        if (nestedTweet && !seen.has(String(nestedTweet.rest_id))) {
          seen.add(String(nestedTweet.rest_id));
          tweets.push(toXTweet(nestedTweet, pageUrl));
        }
      }
    }
  }

  return tweets;
}

function buildThreadMarkdown(tweets: XTweet[]): string {
  return tweets
    .map((tweet, index) => {
      const lines: string[] = [];
      const author = tweet.author ? `@${tweet.author}` : "Unknown";
      const name = tweet.authorName ? `${tweet.authorName} ` : "";
      lines.push(`## ${index + 1}. ${name}${author}`.trim());
      if (tweet.createdAt) {
        lines.push(`_Published: ${tweet.createdAt}_`);
      }
      lines.push(tweet.text || "(No text)");
      const mediaLines = formatMediaList(tweet.media);
      if (mediaLines.length > 0) {
        lines.push(mediaLines.map((line) => `- ${line}`).join("\n"));
      }
      return lines.join("\n\n");
    })
    .join("\n\n");
}

export function extractThreadDocumentFromPayloads(
  payloads: unknown[],
  statusId: string,
  pageUrl: string,
): ExtractedDocument | null {
  const byId = new Map<string, XTweet>();

  for (const payload of payloads) {
    for (const tweet of parseTweetDetailPayload(payload, pageUrl)) {
      if (tweet.id && !byId.has(tweet.id)) {
        byId.set(tweet.id, tweet);
      }
    }
  }

  const tweets = Array.from(byId.values());
  if (tweets.length <= 1 || !byId.has(statusId)) {
    return null;
  }

  const rootTweet = byId.get(statusId) ?? tweets[0];
  const rootAuthor = formatTweetAuthor(rootTweet);

  return {
    url: pageUrl,
    canonicalUrl: rootTweet.url,
    title: normalizeTitle(rootTweet.text, "X Thread"),
    author: rootAuthor,
    siteName: "X",
    publishedAt: rootTweet.createdAt,
    summary: rootTweet.text.slice(0, 200) || undefined,
    adapter: "x",
    metadata: {
      kind: "x/thread",
      tweetId: rootTweet.id,
      tweetCount: tweets.length,
    },
    content: [{ type: "markdown", markdown: buildThreadMarkdown(tweets) }],
  };
}

