# baoyu-reader

`baoyu-reader` 是一个基于 Chrome CDP 的 Bun CLI：输入 URL，输出 `markdown` 或 `json`；命中站点 adapter 时优先消费 API / 页面内数据，未命中时回退到通用 HTML 提取。

## 当前能力

- Chrome CDP 抓取渲染后的页面内容
- 监听网络请求与响应，按需拉取响应体
- adapter registry，支持按 URL 自动命中站点处理器
- 内置 `x` adapter，优先解析 GraphQL 返回
- 通用 fallback：Defuddle 优先，Readability + HTML to Markdown 回退
- `stdout` 或 `--output` 输出 `markdown` / `json`
- 可选下载 adapter 返回的图片/视频并重写 Markdown 链接
- Chrome profile 默认对齐 `baoyu-skills/chrome-profile`

## 安装

```bash
bun install
```

发布到 npm 后，包里只包含 TypeScript 源码，不包含编译后的 `dist`。

推荐直接用 Bun 运行：

```bash
bunx baoyu-reader https://example.com
```

也可以全局安装：

```bash
npm install -g baoyu-reader
```

注意：CLI 入口是 `src/cli.ts`，通过 `bun` 直接执行；运行机器需要有 Bun。

## 用法

```bash
bun run src/cli.ts https://example.com
bunx baoyu-reader https://example.com
baoyu-reader https://example.com
baoyu-reader https://example.com --format markdown --output article.md
baoyu-reader https://example.com --format markdown --output article.md --download-media
baoyu-reader https://x.com/jack/status/20 --format json --output article.json
baoyu-reader https://x.com/jack/status/20 --json
baoyu-reader https://x.com/jack/status/20 --chrome-profile-dir ~/Library/Application\\ Support/baoyu-skills/chrome-profile
```

## 主要参数

```bash
baoyu-reader <url> [options]

Options:
  --output <file>       保存输出内容到文件
  --format <type>       输出格式：markdown | json
  --json                `--format json` 的兼容别名
  --adapter <name>      强制使用指定 adapter（如 x / generic）
  --download-media      下载 adapter 返回的媒体并重写 markdown 链接
  --media-dir <dir>     指定媒体下载根目录；默认使用输出文件所在目录
  --debug-dir <dir>     导出调试信息（html、document.json、network.json）
  --cdp-url <url>       连接现有 Chrome 调试地址
  --browser-path <path> 指定 Chrome 可执行文件
  --chrome-profile-dir <path>
                        指定 Chrome profile 目录。默认使用 BAOYU_CHROME_PROFILE_DIR，
                        否则回退到 baoyu-skills/chrome-profile
  --headless            启动临时 headless Chrome（未连现有实例时）
  --timeout <ms>        页面加载超时，默认 30000
  --help                显示帮助
```

## 设计

核心链路：

1. CLI 解析 URL 和选项
2. 建立 CDP 会话并创建受控 tab
3. 启动 `NetworkJournal` 收集所有请求/响应
4. 由 adapter registry 匹配站点 adapter
5. adapter 返回结构化 `ExtractedDocument`
6. 没命中则走通用 HTML 提取
7. 按请求输出 Markdown，或输出包含 `document` 和 `markdown` 的 JSON

## 开发

```bash
bun run check
bun run test
bun run build
```

## 发版

新增用户可见改动后，先添加一个 changeset：

```bash
bunx changeset
```

把生成的 `.changeset/*.md` 一起合并到 `main` 后，GitHub Actions 会自动创建或更新 release PR；合并 release PR 之后，会自动发布到 npm。

发布流程不会编译 `dist`，而是直接把 `src/*.ts` 发布到 npm。
