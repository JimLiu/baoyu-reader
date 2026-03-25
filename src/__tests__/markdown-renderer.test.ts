import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../extract/markdown-renderer";

describe("renderMarkdown", () => {
  test("renders frontmatter and content blocks", () => {
    const markdown = renderMarkdown({
      url: "https://example.com/post",
      requestedUrl: "https://example.com/post?ref=test",
      title: "Example Title",
      author: "Alice",
      siteName: "Example",
      publishedAt: "2026-03-25",
      adapter: "generic",
      metadata: {
        authorName: "Alice Example",
        authorUsername: "alice",
        authorUrl: "https://example.com/@alice",
        kind: "generic/article",
      },
      content: [
        { type: "paragraph", text: "First paragraph." },
        { type: "list", ordered: false, items: ["One", "Two"] },
      ],
    });

    expect(markdown).toContain("---");
    expect(markdown).toContain('url: "https://example.com/post"');
    expect(markdown).toContain('requestedUrl: "https://example.com/post?ref=test"');
    expect(markdown).toContain('author: "Alice"');
    expect(markdown).toContain('authorName: "Alice Example"');
    expect(markdown).toContain('authorUsername: "alice"');
    expect(markdown).toContain('authorUrl: "https://example.com/@alice"');
    expect(markdown).toContain("# Example Title");
    expect(markdown).toContain("First paragraph.");
    expect(markdown).toContain("- One");
  });
});
