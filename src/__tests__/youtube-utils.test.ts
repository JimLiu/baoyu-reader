import { describe, expect, test } from "bun:test";
import { parseYouTubeVideoId } from "../adapters/youtube/utils";

describe("parseYouTubeVideoId", () => {
  test("parses watch URLs", () => {
    expect(parseYouTubeVideoId(new URL("https://www.youtube.com/watch?v=abc123"))).toBe("abc123");
  });

  test("parses youtu.be URLs", () => {
    expect(parseYouTubeVideoId(new URL("https://youtu.be/abc123"))).toBe("abc123");
  });

  test("parses shorts URLs", () => {
    expect(parseYouTubeVideoId(new URL("https://www.youtube.com/shorts/abc123"))).toBe("abc123");
  });
});

