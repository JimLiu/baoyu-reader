import { describe, expect, test } from "bun:test";
import { parseArgs } from "../cli";

describe("parseArgs", () => {
  test("parses --wait-for interaction", () => {
    const options = parseArgs(["bun", "src/cli.ts", "https://example.com", "--wait-for", "interaction"]);
    expect(options.waitMode).toBe("interaction");
  });

  test("parses --wait-for force", () => {
    const options = parseArgs(["bun", "src/cli.ts", "https://example.com", "--wait-for", "force"]);
    expect(options.waitMode).toBe("force");
  });

  test("maps legacy wait flags to interaction mode", () => {
    const options = parseArgs(["bun", "src/cli.ts", "https://example.com", "--wait-for-interaction"]);
    expect(options.waitMode).toBe("interaction");
  });

  test("rejects invalid wait modes", () => {
    expect(() =>
      parseArgs(["bun", "src/cli.ts", "https://example.com", "--wait-for", "unknown"]),
    ).toThrow("Invalid wait mode");
  });
});
