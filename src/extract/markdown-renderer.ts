import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { ContentBlock, ExtractedDocument } from "./document";

const turndownService = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  bulletListMarker: "-",
});

turndownService.use(gfm);

function renderBlock(block: ContentBlock): string {
  switch (block.type) {
    case "paragraph":
      return block.text.trim();
    case "heading":
      return `${"#".repeat(Math.min(Math.max(block.depth, 1), 6))} ${block.text.trim()}`;
    case "list":
      return block.items
        .map((item, index) => (block.ordered ? `${index + 1}. ${item.trim()}` : `- ${item.trim()}`))
        .join("\n");
    case "quote":
      return block.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.code.trimEnd()}\n\`\`\``;
    case "image":
      return `![${block.alt ?? ""}](${block.url})`;
    case "html":
      return turndownService.turndown(block.html).trim();
    case "markdown":
      return block.markdown.trim();
  }
}

function renderMetadata(document: ExtractedDocument): string | null {
  const lines: string[] = [];
  lines.push(`- Source: ${document.canonicalUrl ?? document.url}`);
  if (document.author) {
    lines.push(`- Author: ${document.author}`);
  }
  if (document.siteName) {
    lines.push(`- Site: ${document.siteName}`);
  }
  if (document.publishedAt) {
    lines.push(`- Published: ${document.publishedAt}`);
  }
  if (document.adapter) {
    lines.push(`- Adapter: ${document.adapter}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function cleanMarkdown(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

export function renderMarkdown(document: ExtractedDocument): string {
  const sections: string[] = [];

  if (document.title) {
    sections.push(`# ${document.title}`);
  }

  const metadata = renderMetadata(document);
  if (metadata) {
    sections.push(metadata);
  }

  const body = document.content
    .map((block) => renderBlock(block))
    .filter(Boolean)
    .join("\n\n");

  const normalizedSummary = document.summary?.trim();
  if (normalizedSummary && !body.startsWith(normalizedSummary)) {
    sections.push(normalizedSummary);
  }

  if (body) {
    sections.push(body);
  }

  return cleanMarkdown(sections.join("\n\n"));
}
