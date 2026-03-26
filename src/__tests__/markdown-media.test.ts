import { describe, expect, test } from "bun:test";
import { collectMediaFromDocument, rewriteMarkdownMediaLinks } from "../media/markdown-media";

describe("markdown media helpers", () => {
  test("collects cover, image markdown, and plain media urls from a document", () => {
    const media = collectMediaFromDocument({
      url: "https://example.com/post",
      metadata: {
        coverImage: "https://cdn.example.com/cover.jpg",
      },
      content: [
        { type: "paragraph", text: "Poster: https://cdn.example.com/poster.png" },
        { type: "markdown", markdown: "![inline](https://cdn.example.com/body.webp)\n\n[video](https://cdn.example.com/clip.mp4)" },
      ],
    });

    expect(media).toEqual([
      { url: "https://cdn.example.com/cover.jpg", kind: "image", role: "cover" },
      { url: "https://cdn.example.com/poster.png", kind: "image", role: "inline" },
      { url: "https://cdn.example.com/body.webp", kind: "image", role: "inline" },
      { url: "https://cdn.example.com/clip.mp4", kind: "video", role: "inline" },
    ]);
  });

  test("rewrites markdown links, frontmatter cover images, and plain url mentions", () => {
    const markdown = `---
coverImage: "https://cdn.example.com/cover.jpg"
---

![inline](https://cdn.example.com/body.webp)

Poster: https://cdn.example.com/poster.png
`;

    const rewritten = rewriteMarkdownMediaLinks(markdown, [
      {
        url: "https://cdn.example.com/cover.jpg",
        localPath: "imgs/img-001-cover.jpg",
        absolutePath: "/tmp/imgs/img-001-cover.jpg",
        kind: "image",
      },
      {
        url: "https://cdn.example.com/body.webp",
        localPath: "imgs/img-002-body.webp",
        absolutePath: "/tmp/imgs/img-002-body.webp",
        kind: "image",
      },
      {
        url: "https://cdn.example.com/poster.png",
        localPath: "imgs/img-003-poster.png",
        absolutePath: "/tmp/imgs/img-003-poster.png",
        kind: "image",
      },
    ]);

    expect(rewritten).toContain('coverImage: "imgs/img-001-cover.jpg"');
    expect(rewritten).toContain("![inline](imgs/img-002-body.webp)");
    expect(rewritten).toContain("Poster: imgs/img-003-poster.png");
  });
});
