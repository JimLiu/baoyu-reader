import { describe, expect, test } from "bun:test";
import { extractSingleTweetDocumentFromPayload } from "../adapters/x/single";

describe("x single tweet extraction", () => {
  test("upgrades image urls to high resolution for tweet and quoted tweet media", () => {
    const payload = {
      data: {
        tweetResult: {
          result: {
            rest_id: "2036762680401223946",
            legacy: {
              full_text: "Main tweet text https://t.co/media",
              favorite_count: 12,
              retweet_count: 3,
              reply_count: 1,
              created_at: "Wed Mar 25 11:10:38 +0000 2026",
              extended_entities: {
                media: [
                  {
                    type: "photo",
                    media_url_https: "https://pbs.twimg.com/media/main-image.png",
                    url: "https://t.co/media",
                  },
                ],
              },
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
            quoted_status_result: {
              result: {
                rest_id: "999",
                legacy: {
                  full_text: "Quoted tweet text",
                  favorite_count: 4,
                  retweet_count: 2,
                  reply_count: 1,
                  created_at: "Wed Mar 25 10:10:38 +0000 2026",
                  extended_entities: {
                    media: [
                      {
                        type: "photo",
                        media_url_https: "https://pbs.twimg.com/media/quoted?format=jpeg&name=small",
                      },
                    ],
                  },
                },
                core: {
                  user_results: {
                    result: {
                      legacy: {
                        name: "Quoted Author",
                        screen_name: "quoted_author",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const document = extractSingleTweetDocumentFromPayload(
      payload,
      "2036762680401223946",
      "https://x.com/ericzakariasson/status/2036762680401223946",
    );

    expect(document).not.toBeNull();

    const imageBlock = document?.content.find((block) => block.type === "image");
    expect(imageBlock).toEqual({
      type: "image",
      url: "https://pbs.twimg.com/media/main-image?format=png&name=4096x4096",
    });

    const quoteBlock = document?.content.find((block) => block.type === "quote");
    expect(quoteBlock).toEqual({
      type: "quote",
      text:
        "Quoted Author (@quoted_author)\n\nQuoted tweet text\n\nphoto: https://pbs.twimg.com/media/quoted?format=jpg&name=4096x4096",
    });
  });
});
