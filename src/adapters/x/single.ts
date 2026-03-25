import type { ExtractedDocument, ContentBlock } from "../../extract/document";
import { findTweetNode, formatMediaList, formatTweetAuthor, getTweetText, isRecord, normalizeTitle, toXTweet } from "./shared";

export function extractSingleTweetDocumentFromPayload(
  payload: unknown,
  statusId: string,
  pageUrl: string,
): ExtractedDocument | null {
  const tweet = findTweetNode(payload, statusId);
  if (!tweet) {
    return null;
  }

  const xTweet = toXTweet(tweet, pageUrl);
  const content: ContentBlock[] = [];

  if (xTweet.text) {
    content.push({ type: "paragraph", text: xTweet.text });
  }

  for (const mediaLine of formatMediaList(xTweet.media)) {
    if (mediaLine.startsWith("photo: ")) {
      content.push({
        type: "image",
        url: mediaLine.slice("photo: ".length),
      });
    } else {
      content.push({
        type: "list",
        ordered: false,
        items: [mediaLine],
      });
    }
  }

  const quoted =
    isRecord(tweet.quoted_status_result) && isRecord(tweet.quoted_status_result.result)
      ? tweet.quoted_status_result.result
      : null;
  if (quoted && isRecord(quoted)) {
    const quotedText = getTweetText(quoted);
    if (quotedText) {
      content.push({ type: "heading", depth: 2, text: "Quoted Tweet" });
      content.push({ type: "quote", text: quotedText });
    }
  }

  return {
    url: pageUrl,
    canonicalUrl: xTweet.url,
    title: normalizeTitle(
      xTweet.author ? `@${xTweet.author}: ${xTweet.text}` : xTweet.text,
      "Tweet",
    ),
    author: formatTweetAuthor(xTweet),
    siteName: "X",
    publishedAt: xTweet.createdAt,
    summary: xTweet.text.slice(0, 200) || undefined,
    adapter: "x",
    metadata: {
      kind: "x/post",
      tweetId: xTweet.id,
      conversationId:
        typeof tweet.legacy === "object" &&
        tweet.legacy !== null &&
        typeof (tweet.legacy as Record<string, unknown>).conversation_id_str === "string"
          ? (tweet.legacy as Record<string, unknown>).conversation_id_str
          : undefined,
      favoriteCount: xTweet.likes,
      replyCount: xTweet.replies,
      retweetCount: xTweet.retweets,
    },
    content,
  };
}

