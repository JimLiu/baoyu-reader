import { describe, expect, test } from "bun:test";
import { extractSingleTweetDocumentFromPayload } from "../adapters/x/single";

describe("x single tweet extraction", () => {
  test("replaces t.co links in note tweets with expanded urls", () => {
    const payload = {
      data: {
        tweetResult: {
          result: {
            rest_id: "2036483061635039711",
            legacy: {
              full_text:
                "First, some context:\n\n1. This analysis is based on data from @trueupio, one of my favorite collaborators and sources of data. They track job openings at tech companies and top startups around the world (over 9,000 companies) and make it easy to browse open gigs. Their data looks",
              favorite_count: 43,
              retweet_count: 1,
              reply_count: 1,
              created_at: "Tue Mar 24 16:39:32 +0000 2026",
              entities: {
                hashtags: [],
                symbols: [],
                timestamps: [],
                urls: [],
                user_mentions: [
                  {
                    id_str: "1407256023547613193",
                    indices: [61, 70],
                    name: "TrueUp",
                    screen_name: "trueupio",
                  },
                ],
              },
            },
            note_tweet: {
              note_tweet_results: {
                result: {
                  text:
                    "First, some context:\n\n1. This analysis is based on data from @trueupio, one of my favorite collaborators and sources of data. They track job openings at tech companies and top startups around the world (over 9,000 companies) and make it easy to browse open gigs. Their data looks at roles at tech companies—the most sought-after and lucrative jobs. (It doesn’t include roles at non-tech companies and consulting agencies.) Browse open roles here: https://t.co/x7ff2NjpP1\n\n2. Keep reading for highlights, or jump straight to the full report: https://t.co/AbqPp2TEde",
                  entity_set: {
                    hashtags: [],
                    symbols: [],
                    urls: [
                      {
                        display_url: "trueup.io/jobs",
                        expanded_url: "https://trueup.io/jobs",
                        indices: [447, 470],
                        url: "https://t.co/x7ff2NjpP1",
                      },
                      {
                        display_url: "lennysnewsletter.com/i/191595250/if…",
                        expanded_url:
                          "https://www.lennysnewsletter.com/i/191595250/if-youre-having-trouble-finding-a-job",
                        indices: [541, 564],
                        url: "https://t.co/AbqPp2TEde",
                      },
                    ],
                    user_mentions: [
                      {
                        id_str: "1407256023547613193",
                        indices: [61, 70],
                        name: "TrueUp",
                        screen_name: "trueupio",
                      },
                    ],
                  },
                },
              },
            },
            core: {
              user_results: {
                result: {
                  legacy: {
                    name: "Lenny Rachitsky",
                    screen_name: "lennysan",
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
      "2036483061635039711",
      "https://x.com/lennysan/status/2036483061635039711",
    );

    expect(document).not.toBeNull();

    const paragraphBlock = document?.content.find((block) => block.type === "paragraph");
    expect(paragraphBlock).toEqual({
      type: "paragraph",
      text:
        "First, some context:\n\n1. This analysis is based on data from @trueupio, one of my favorite collaborators and sources of data. They track job openings at tech companies and top startups around the world (over 9,000 companies) and make it easy to browse open gigs. Their data looks at roles at tech companies—the most sought-after and lucrative jobs. (It doesn’t include roles at non-tech companies and consulting agencies.) Browse open roles here: https://trueup.io/jobs\n\n2. Keep reading for highlights, or jump straight to the full report: https://www.lennysnewsletter.com/i/191595250/if-youre-having-trouble-finding-a-job",
    });
  });

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
