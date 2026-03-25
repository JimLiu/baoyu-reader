import { describe, expect, test } from "bun:test";
import { shouldAutoContinueForceWait } from "../commands/convert";

describe("shouldAutoContinueForceWait", () => {
  test("continues when a challenge disappears", () => {
    expect(
      shouldAutoContinueForceWait(
        {
          url: "https://example.com/challenge",
          hasGate: true,
          loginState: "unknown",
        },
        {
          url: "https://example.com/article",
          hasGate: false,
          loginState: "unknown",
        },
      ),
    ).toBe(true);
  });

  test("continues when login state improves from logged out", () => {
    expect(
      shouldAutoContinueForceWait(
        {
          url: "https://x.com/i/flow/login",
          hasGate: false,
          loginState: "logged_out",
        },
        {
          url: "https://x.com/home",
          hasGate: false,
          loginState: "logged_in",
        },
      ),
    ).toBe(true);
  });

  test("does not continue when nothing changed yet", () => {
    expect(
      shouldAutoContinueForceWait(
        {
          url: "https://x.com/lennysan/status/2036483059407810640",
          hasGate: false,
          loginState: "unknown",
        },
        {
          url: "https://x.com/lennysan/status/2036483059407810640",
          hasGate: false,
          loginState: "unknown",
        },
      ),
    ).toBe(false);
  });
});
