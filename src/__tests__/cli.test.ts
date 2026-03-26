import { describe, expect, test } from "bun:test";
import { HELP_TEXT, parseArgs } from "../cli";

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

  test("parses media download options", () => {
    const options = parseArgs([
      "bun",
      "src/cli.ts",
      "https://example.com",
      "--download-media",
      "--media-dir",
      "./assets",
    ]);

    expect(options.downloadMedia).toBe(true);
    expect(options.mediaDir).toBe("./assets");
  });

  test("rejects invalid wait modes", () => {
    expect(() =>
      parseArgs(["bun", "src/cli.ts", "https://example.com", "--wait-for", "unknown"]),
    ).toThrow("Invalid wait mode");
  });

  test("documents wait modes in help text", () => {
    expect(HELP_TEXT).toContain("--wait-for <mode>");
    expect(HELP_TEXT).toContain("--download-media");
    expect(HELP_TEXT).toContain("force: start visible Chrome, then auto-continue");
    expect(HELP_TEXT).toContain("or continue immediately when you press Enter");
  });
});
