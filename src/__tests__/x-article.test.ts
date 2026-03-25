import { describe, expect, test } from "bun:test";
import { extractArticleDocumentFromPayload } from "../adapters/x/article";

describe("x article extraction", () => {
  test("renders markdown entities referenced by atomic blocks", () => {
    const payload = {
      data: {
        tweetResult: {
          result: {
            rest_id: "2036762680401223946",
            legacy: {
              full_text: "Fallback text",
              favorite_count: 12,
              retweet_count: 3,
              reply_count: 1,
              created_at: "Wed Mar 25 11:10:38 +0000 2026",
            },
            core: {
              user_results: {
                result: {
                  legacy: {
                    name: "Eric Zakariasson",
                    screen_name: "ericzakariasson",
                  },
                },
              },
            },
            article: {
              article_results: {
                result: {
                  title: "Building CLIs for agents",
                  content_state: {
                    blocks: [
                      {
                        type: "unstyled",
                        text: "Make it non-interactive.",
                        data: {},
                        entityRanges: [],
                        inlineStyleRanges: [],
                      },
                      {
                        type: "atomic",
                        text: " ",
                        data: {},
                        entityRanges: [{ key: 0, length: 1, offset: 0 }],
                        inlineStyleRanges: [],
                      },
                      {
                        type: "unstyled",
                        text: "Return data on success.",
                        data: {},
                        entityRanges: [],
                        inlineStyleRanges: [],
                      },
                    ],
                    entityMap: [
                      {
                        key: "0",
                        value: {
                          type: "MARKDOWN",
                          mutability: "Mutable",
                          data: {
                            markdown: "```bash\n$ mycli deploy --env production --dry-run\n```",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };

    const document = extractArticleDocumentFromPayload(
      payload,
      "2036762680401223946",
      "https://x.com/ericzakariasson/status/2036762680401223946",
    );

    expect(document).not.toBeNull();
    expect(document?.metadata?.kind).toBe("x/article");

    const content = document?.content[0];
    expect(content?.type).toBe("markdown");
    if (!content || content.type !== "markdown") {
      throw new Error("Expected markdown content");
    }

    expect(content.markdown).toContain("```bash");
    expect(content.markdown).toContain("$ mycli deploy --env production --dry-run");
    expect(content.markdown).toContain("Make it non-interactive.");
    expect(content.markdown).toContain("Return data on success.");
  });
});
