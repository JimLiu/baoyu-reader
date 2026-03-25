#!/usr/bin/env bun

import { runConvertCommand, type ConvertCommandOptions } from "./commands/convert";

const HELP_TEXT = `
baoyu-markdown - Convert a URL into Markdown with Chrome CDP

Usage:
  baoyu-markdown <url> [options]

Options:
  --output <file>       Save markdown to file
  --json                Print structured JSON instead of markdown
  --adapter <name>      Force an adapter (e.g. x, generic)
  --debug-dir <dir>     Write debug artifacts
  --cdp-url <url>       Reuse an existing Chrome DevTools endpoint
  --browser-path <path> Explicit Chrome binary path
  --chrome-profile-dir <path>
                        Chrome user data dir. Defaults to BAOYU_CHROME_PROFILE_DIR
                        or baoyu-skills/chrome-profile.
  --headless            Launch a temporary headless Chrome if needed
  --timeout <ms>        Page timeout in milliseconds (default: 30000)
  --help                Show help
`.trim();

interface CliOptions extends ConvertCommandOptions {
  url?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    headless: false,
    timeoutMs: 30_000,
    help: false,
  };

  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }
    if (value === "--json") {
      options.json = true;
      continue;
    }
    if (value === "--headless") {
      options.headless = true;
      continue;
    }
    if (value === "--output") {
      options.output = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--adapter") {
      options.adapter = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--debug-dir") {
      options.debugDir = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--cdp-url") {
      options.cdpUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--browser-path") {
      options.browserPath = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--chrome-profile-dir") {
      options.chromeProfileDir = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--timeout") {
      const parsed = Number(args[index + 1]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid timeout: ${args[index + 1]}`);
      }
      options.timeoutMs = parsed;
      index += 1;
      continue;
    }
    if (value.startsWith("-")) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (!options.url) {
      options.url = value;
      continue;
    }
    throw new Error(`Unexpected argument: ${value}`);
  }

  return options;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv);
    if (options.help || !options.url) {
      console.log(HELP_TEXT);
      return;
    }

    await runConvertCommand(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

void main();
