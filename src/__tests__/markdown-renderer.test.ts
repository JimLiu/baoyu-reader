import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../extract/markdown-renderer";

describe("renderMarkdown", () => {
  test("renders metadata and content blocks", () => {
    const markdown = renderMarkdown({
      url: "https://example.com/post",
      title: "Example Title",
      author: "Alice",
      siteName: "Example",
      publishedAt: "2026-03-25",
      adapter: "generic",
      content: [
        { type: "paragraph", text: "First paragraph." },
        { type: "list", ordered: false, items: ["One", "Two"] },
      ],
    });

    expect(markdown).toContain("# Example Title");
    expect(markdown).toContain("- Author: Alice");
    expect(markdown).toContain("First paragraph.");
    expect(markdown).toContain("- One");
  });
});
