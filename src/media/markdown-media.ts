import type { ContentBlock, ExtractedDocument } from "../extract/document";
import {
  isDataUri,
  normalizeContentType,
  normalizeMediaUrl,
  resolveExtensionFromContentType,
  resolveExtensionFromUrl,
  resolveKindFromExtension,
} from "./media-utils";
import type { MediaAsset, MediaReplacement } from "./types";

const MARKDOWN_LINK_RE =
  /(!?\[[^\]\n]*\])\((<)?((?:https?:\/\/[^)\s>]+)|(?:data:[^)>\s]+))(>)?\)/g;
const FRONTMATTER_COVER_RE = /^(coverImage:\s*")((?:https?:\/\/[^"]+)|(?:data:[^"]+))(")/m;
const RAW_URL_RE = /(?:https?:\/\/[^\s<>"')\]]+|data:[^\s<>"')\]]+)/g;

function inferMediaKindFromLabel(label: string, rawUrl: string): "image" | "video" | undefined {
  if (label.startsWith("![")) {
    return "image";
  }

  const normalizedLabel = label.replace(/[!\[\]]/g, "").trim().toLowerCase();
  if (/\b(video|animated[_ -]?gif|gif)\b/.test(normalizedLabel)) {
    return "video";
  }

  if (isDataUri(rawUrl)) {
    const contentType = normalizeContentType(rawUrl.slice(5, rawUrl.indexOf(";")));
    return contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : undefined;
  }

  return resolveKindFromExtension(resolveExtensionFromUrl(rawUrl));
}

function inferMediaKindFromRawUrl(rawUrl: string): "image" | "video" | undefined {
  if (isDataUri(rawUrl)) {
    const contentType = normalizeContentType(rawUrl.slice(5, rawUrl.indexOf(";")));
    return contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : undefined;
  }

  return resolveKindFromExtension(resolveExtensionFromUrl(rawUrl));
}

function pushMedia(assets: MediaAsset[], seen: Set<string>, media: MediaAsset): void {
  const normalizedUrl = normalizeMediaUrl(media.url);
  if (!normalizedUrl || seen.has(normalizedUrl)) {
    return;
  }
  seen.add(normalizedUrl);
  assets.push({
    ...media,
    url: normalizedUrl,
  });
}

export function normalizeMarkdownMediaLinks(markdown: string): string {
  MARKDOWN_LINK_RE.lastIndex = 0;
  let result = markdown.replace(MARKDOWN_LINK_RE, (full, label, openAngle, rawUrl, closeAngle) => {
    const normalizedUrl = normalizeMediaUrl(rawUrl);
    if (normalizedUrl === rawUrl) {
      return full;
    }
    return `${label}(${openAngle ?? ""}${normalizedUrl}${closeAngle ?? ""})`;
  });

  result = result.replace(FRONTMATTER_COVER_RE, (full, prefix, rawUrl, suffix) => {
    const normalizedUrl = normalizeMediaUrl(rawUrl);
    if (normalizedUrl === rawUrl) {
      return full;
    }
    return `${prefix}${normalizedUrl}${suffix}`;
  });

  RAW_URL_RE.lastIndex = 0;
  return result.replace(RAW_URL_RE, (rawUrl) => normalizeMediaUrl(rawUrl));
}

export function collectMediaFromText(
  text: string,
  options: {
    role?: MediaAsset["role"];
    defaultKind?: MediaAsset["kind"];
    seen?: Set<string>;
    into?: MediaAsset[];
  } = {},
): MediaAsset[] {
  const assets = options.into ?? [];
  const seen = options.seen ?? new Set<string>();

  MARKDOWN_LINK_RE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = MARKDOWN_LINK_RE.exec(text))) {
    const label = linkMatch[1] ?? "";
    const rawUrl = linkMatch[3] ?? "";
    const kind = inferMediaKindFromLabel(label, rawUrl) ?? options.defaultKind;
    if (!kind) {
      continue;
    }
    pushMedia(assets, seen, {
      url: rawUrl,
      kind,
      role: options.role ?? "inline",
    });
  }

  RAW_URL_RE.lastIndex = 0;
  let rawMatch: RegExpExecArray | null;
  while ((rawMatch = RAW_URL_RE.exec(text))) {
    const rawUrl = rawMatch[0] ?? "";
    const kind = inferMediaKindFromRawUrl(rawUrl) ?? options.defaultKind;
    if (!kind) {
      continue;
    }
    pushMedia(assets, seen, {
      url: rawUrl,
      kind,
      role: options.role ?? "inline",
    });
  }

  return assets;
}

function collectMediaFromBlock(
  block: ContentBlock,
  assets: MediaAsset[],
  seen: Set<string>,
): void {
  switch (block.type) {
    case "image":
      pushMedia(assets, seen, {
        url: block.url,
        kind: "image",
        role: "inline",
        alt: block.alt,
      });
      return;
    case "html":
    case "markdown":
      collectMediaFromText(block.type === "html" ? block.html : block.markdown, {
        role: "inline",
        seen,
        into: assets,
      });
      return;
    case "paragraph":
    case "quote":
      collectMediaFromText(block.text, {
        role: "inline",
        seen,
        into: assets,
      });
      return;
    case "list":
      for (const item of block.items) {
        collectMediaFromText(item, {
          role: "attachment",
          seen,
          into: assets,
        });
      }
      return;
    case "heading":
    case "code":
      return;
  }
}

export function collectMediaFromDocument(document: ExtractedDocument): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const seen = new Set<string>();
  const coverImage =
    typeof document.metadata?.coverImage === "string" ? document.metadata.coverImage : undefined;

  if (coverImage) {
    pushMedia(assets, seen, {
      url: coverImage,
      kind: "image",
      role: "cover",
    });
  }

  for (const block of document.content) {
    collectMediaFromBlock(block, assets, seen);
  }

  return assets;
}

export function collectMediaFromMarkdown(markdown: string): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const seen = new Set<string>();
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const coverMatch = fmMatch[1]?.match(FRONTMATTER_COVER_RE);
    if (coverMatch?.[2]) {
      pushMedia(assets, seen, {
        url: coverMatch[2],
        kind: "image",
        role: "cover",
      });
    }
  }

  collectMediaFromText(markdown, { seen, into: assets });
  return assets;
}

export function rewriteMarkdownMediaLinks(
  markdown: string,
  replacements: MediaReplacement[],
): string {
  if (replacements.length === 0) {
    return markdown;
  }

  const replacementMap = new Map<string, string>();
  for (const item of replacements) {
    replacementMap.set(item.url, item.localPath);
    replacementMap.set(normalizeMediaUrl(item.url), item.localPath);
  }

  MARKDOWN_LINK_RE.lastIndex = 0;
  let result = markdown.replace(MARKDOWN_LINK_RE, (full, label, _openAngle, rawUrl) => {
    const replacement = replacementMap.get(rawUrl) ?? replacementMap.get(normalizeMediaUrl(rawUrl));
    if (!replacement) {
      return full;
    }
    return `${label}(${replacement})`;
  });

  result = result.replace(FRONTMATTER_COVER_RE, (full, prefix, rawUrl, suffix) => {
    const replacement = replacementMap.get(rawUrl) ?? replacementMap.get(normalizeMediaUrl(rawUrl));
    if (!replacement) {
      return full;
    }
    return `${prefix}${replacement}${suffix}`;
  });

  for (const { url, localPath } of replacements) {
    result = result.split(url).join(localPath);
    const normalizedUrl = normalizeMediaUrl(url);
    if (normalizedUrl !== url) {
      result = result.split(normalizedUrl).join(localPath);
    }
  }

  return result;
}

export function resolveDataUriExtension(rawUrl: string): string | undefined {
  if (!isDataUri(rawUrl)) {
    return undefined;
  }
  const separatorIndex = rawUrl.indexOf(";");
  const contentType = normalizeContentType(rawUrl.slice(5, separatorIndex === -1 ? undefined : separatorIndex));
  return resolveExtensionFromContentType(contentType);
}
