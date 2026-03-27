# Changelog

English | [简体中文](./CHANGELOG.zh-CN.md)

The format is inspired by Keep a Changelog, and the project follows Semantic
Versioning.

## [0.1.1] - 2026-03-27

#### Added

- Added the `hn` adapter for Hacker News stories and comment threads.
- Added `--download-media` and `--media-dir` to download extracted media and
  rewrite Markdown links.
- Added Defuddle as the first generic extraction pass, with Readability +
  HTML-to-Markdown as fallback.
- Added interactive wait modes for login and verification flows, including
  manual verification handoff and force-wait resume behavior.
- Added `--format markdown|json` while keeping `--json` as a compatibility
  alias.
- Added Changesets-based release automation for npm publishing.

#### Changed

- Renamed the package and CLI from `baoyu-markdown` to `baoyu-reader`.
- Changed the published package to run `src/cli.ts` directly with Bun instead of
  shipping a prebuilt `dist`.
- Improved X extraction for threads, articles, note tweets, embeds, image URLs,
  login state handling, and media metadata.
- Improved YouTube transcript extraction and normalized Markdown image output.

#### Fixed

- Fixed X note tweet URL expansion.
- Fixed media URL normalization before download, including Substack media links.
- Fixed foreground behavior for interactive flows so manual steps are easier to
  complete.

## [0.1.0] - 2026-03-25

#### Added

- Initial public release as `baoyu-markdown`.
- Added Chrome CDP session management, controlled tabs, and network journaling.
- Added built-in adapters for `x`, `youtube`, and the generic fallback.
- Added X article parsing, X single/tweet extraction, and YouTube transcript
  extraction.
- Added Markdown rendering, document metadata output, and CLI support for file
  output, JSON output, debug exports, custom Chrome connection settings,
  headless mode, and timeout control.
