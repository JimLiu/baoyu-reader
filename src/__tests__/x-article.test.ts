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

  test("renders media, embedded tweets, and cover image from article entities", () => {
    const embeddedTweetPayload = {
      data: {
        tweetResult: {
          result: {
            rest_id: "999",
            legacy: {
              full_text: "Embedded tweet text",
              favorite_count: 4,
              retweet_count: 2,
              reply_count: 1,
              created_at: "Wed Mar 25 11:10:38 +0000 2026",
              extended_entities: {
                media: [
                  {
                    type: "photo",
                    media_url_https: "https://pbs.twimg.com/media/embedded.jpg",
                  },
                ],
              },
            },
            core: {
              user_results: {
                result: {
                  core: {
                    name: "Embedded Author",
                    screen_name: "embedded_author",
                  },
                  legacy: {},
                },
              },
            },
          },
        },
      },
    };

    const articlePayload = {
      data: {
        tweetResult: {
          result: {
            rest_id: "2036670816344064290",
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
                  title: "Article with media",
                  cover_media: {
                    media_info: {
                      original_img_url: "https://pbs.twimg.com/media/cover.jpg",
                    },
                  },
                  media_entities: [
                    {
                      media_id: "42",
                      media_info: {
                        original_img_url: "https://pbs.twimg.com/media/body.jpg",
                      },
                    },
                  ],
                  content_state: {
                    blocks: [
                      {
                        type: "unstyled",
                        text: "Read more: https://t.co/example",
                        data: {},
                        entityRanges: [{ key: 2, length: 20, offset: 11 }],
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
                        type: "atomic",
                        text: " ",
                        data: {},
                        entityRanges: [{ key: 1, length: 1, offset: 0 }],
                        inlineStyleRanges: [],
                      },
                    ],
                    entityMap: [
                      {
                        key: "0",
                        value: {
                          type: "MEDIA",
                          mutability: "Immutable",
                          data: {
                            mediaItems: [{ mediaId: "42" }],
                          },
                        },
                      },
                      {
                        key: "1",
                        value: {
                          type: "TWEET",
                          mutability: "Immutable",
                          data: {
                            tweetId: "999",
                          },
                        },
                      },
                      {
                        key: "2",
                        value: {
                          type: "LINK",
                          mutability: "Mutable",
                          data: {
                            url: "https://example.com/report",
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
      articlePayload,
      "2036670816344064290",
      "https://x.com/ericzakariasson/status/2036670816344064290",
      [articlePayload, embeddedTweetPayload],
    );

    expect(document).not.toBeNull();
    expect(document?.metadata?.coverImage).toBe("https://pbs.twimg.com/media/cover.jpg");

    const content = document?.content[0];
    expect(content?.type).toBe("markdown");
    if (!content || content.type !== "markdown") {
      throw new Error("Expected markdown content");
    }

    expect(content.markdown).toContain("https://example.com/report");
    expect(content.markdown).toContain("![](https://pbs.twimg.com/media/body.jpg)");
    expect(content.markdown).toContain("> Embedded Author (@embedded_author)");
    expect(content.markdown).toContain("> Embedded tweet text");
    expect(content.markdown).toContain("> ![](https://pbs.twimg.com/media/embedded.jpg)");
  });
});
