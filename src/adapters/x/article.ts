import type { ExtractedDocument } from "../../extract/document";
import { getTweetAuthorMetadata, getTweetText, findTweetNode, formatTweetAuthor, getUser, isRecord, normalizeTitle, toXTweet } from "./shared";
import type { JsonObject } from "./types";

function normalizeEntityMap(entityMap: unknown): Map<string, JsonObject> {
  const normalized = new Map<string, JsonObject>();

  if (Array.isArray(entityMap)) {
    for (const entry of entityMap) {
      if (!isRecord(entry)) {
        continue;
      }

      const key =
        typeof entry.key === "string" || typeof entry.key === "number"
          ? String(entry.key)
          : undefined;
      const value = isRecord(entry.value) ? entry.value : undefined;
      if (!key || !value) {
        continue;
      }
      normalized.set(key, value);
    }

    return normalized;
  }

  if (!isRecord(entityMap)) {
    return normalized;
  }

  for (const [key, value] of Object.entries(entityMap)) {
    if (!isRecord(value)) {
      continue;
    }
    normalized.set(key, value);
  }

  return normalized;
}

function getEntityMarkdown(entityMap: Map<string, JsonObject>, entityKey: unknown): string | null {
  const key =
    typeof entityKey === "string" || typeof entityKey === "number"
      ? String(entityKey)
      : undefined;
  if (!key) {
    return null;
  }

  const entity = entityMap.get(key);
  if (!entity || entity.type !== "MARKDOWN") {
    return null;
  }

  const data = isRecord(entity.data) ? entity.data : {};
  if (typeof data.markdown !== "string") {
    return null;
  }

  const markdown = data.markdown.trim();
  return markdown || null;
}

function renderAtomicBlock(block: JsonObject, entityMap: Map<string, JsonObject>): string | null {
  const entityRanges = Array.isArray(block.entityRanges) ? block.entityRanges : [];
  const parts: string[] = [];

  for (const range of entityRanges) {
    if (!isRecord(range)) {
      continue;
    }

    const markdown = getEntityMarkdown(entityMap, range.key);
    if (markdown) {
      parts.push(markdown);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

function renderArticleBlocks(blocks: unknown[], entityMap: Map<string, JsonObject>): string {
  const parts: string[] = [];
  let orderedCounter = 0;

  for (const block of blocks) {
    if (!isRecord(block)) {
      continue;
    }

    const blockType = typeof block.type === "string" ? block.type : "unstyled";
    const text = typeof block.text === "string" ? block.text.trim() : "";
    if (!text && blockType !== "atomic") {
      continue;
    }

    if (blockType !== "ordered-list-item") {
      orderedCounter = 0;
    }

    switch (blockType) {
      case "header-one":
        parts.push(`# ${text}`);
        break;
      case "header-two":
        parts.push(`## ${text}`);
        break;
      case "header-three":
        parts.push(`### ${text}`);
        break;
      case "blockquote":
        parts.push(`> ${text}`);
        break;
      case "unordered-list-item":
        parts.push(`- ${text}`);
        break;
      case "ordered-list-item":
        orderedCounter += 1;
        parts.push(`${orderedCounter}. ${text}`);
        break;
      case "code-block":
        parts.push(`\`\`\`\n${text}\n\`\`\``);
        break;
      case "atomic": {
        const markdown = renderAtomicBlock(block, entityMap);
        if (markdown) {
          parts.push(markdown);
        }
        break;
      }
      default:
        parts.push(text);
        break;
    }
  }

  return parts.join("\n\n").trim();
}

function getArticleResult(tweet: JsonObject): JsonObject | null {
  if (
    isRecord(tweet.article) &&
    isRecord(tweet.article.article_results) &&
    isRecord(tweet.article.article_results.result)
  ) {
    return tweet.article.article_results.result as JsonObject;
  }
  return null;
}

function extractSummary(markdown: string): string | undefined {
  const segments = markdown
    .split(/\n\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const preferred = segments.find((segment) => !/^(#|>|- |\d+\. |\`\`\`)/.test(segment));
  return preferred?.slice(0, 220);
}

export function extractArticleDocumentFromPayload(
  payload: unknown,
  statusId: string,
  pageUrl: string,
): ExtractedDocument | null {
  const tweet = findTweetNode(payload, statusId);
  if (!tweet) {
    return null;
  }

  const articleResult = getArticleResult(tweet);
  if (!articleResult) {
    return null;
  }

  const title = typeof articleResult.title === "string" ? articleResult.title.trim() : undefined;
  const contentState = isRecord(articleResult.content_state) ? articleResult.content_state : {};
  const blocks = Array.isArray(contentState.blocks) ? contentState.blocks : [];
  const entityMap = normalizeEntityMap(contentState.entityMap);
  const richMarkdown = renderArticleBlocks(blocks, entityMap);
  const plainText = typeof articleResult.plain_text === "string" ? articleResult.plain_text.trim() : "";
  const markdown = richMarkdown || plainText || getTweetText(tweet);
  if (!markdown) {
    return null;
  }

  const xTweet = toXTweet(tweet, pageUrl);
  const user = getUser(tweet);

  return {
    url: pageUrl,
    canonicalUrl: xTweet.url,
    title: title || normalizeTitle(xTweet.text, "X Article"),
    author: formatTweetAuthor(xTweet),
    siteName: "X",
    publishedAt: xTweet.createdAt,
    summary: extractSummary(markdown) || xTweet.text.slice(0, 200) || undefined,
    adapter: "x",
    metadata: {
      kind: "x/article",
      tweetId: xTweet.id,
      authorName: xTweet.authorName ?? user.name,
      authorUsername: xTweet.author ?? user.screenName,
      authorUrl: (xTweet.author ?? user.screenName) ? `https://x.com/${xTweet.author ?? user.screenName}` : undefined,
      ...getTweetAuthorMetadata(xTweet),
    },
    content: [{ type: "markdown", markdown }],
  };
}
