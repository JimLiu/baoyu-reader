import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import os from "node:os";
import { resolveChromeProfileDir } from "../browser/profile";

const originalProfile = process.env.BAOYU_CHROME_PROFILE_DIR;

afterEach(() => {
  if (originalProfile === undefined) {
    delete process.env.BAOYU_CHROME_PROFILE_DIR;
  } else {
    process.env.BAOYU_CHROME_PROFILE_DIR = originalProfile;
  }
});

describe("resolveChromeProfileDir", () => {
  test("uses BAOYU_CHROME_PROFILE_DIR when set", () => {
    process.env.BAOYU_CHROME_PROFILE_DIR = "/tmp/baoyu-profile";
    expect(resolveChromeProfileDir()).toBe("/tmp/baoyu-profile");
  });

  test("falls back to shared baoyu-skills profile path", () => {
    delete process.env.BAOYU_CHROME_PROFILE_DIR;
    const resolved = resolveChromeProfileDir();
    if (process.platform === "darwin") {
      expect(resolved).toBe(path.join(os.homedir(), "Library", "Application Support", "baoyu-skills", "chrome-profile"));
    } else if (process.platform === "win32") {
      expect(resolved.endsWith(path.join("baoyu-skills", "chrome-profile"))).toBe(true);
    } else {
      expect(resolved.endsWith(path.join("baoyu-skills", "chrome-profile"))).toBe(true);
    }
  });
});

