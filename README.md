# baoyu-markdown

`baoyu-markdown` 是一个基于 Chrome CDP 的 Bun CLI：输入 URL，输出结构化 Markdown；命中站点 adapter 时优先消费 API / 页面内数据，未命中时回退到通用 HTML 提取。

## 当前能力

- Chrome CDP 抓取渲染后的页面内容
- 监听网络请求与响应，按需拉取响应体
- adapter registry，支持按 URL 自动命中站点处理器
- 内置 `x` adapter，优先解析 GraphQL 返回
- 通用 fallback：Defuddle 优先，Readability + HTML to Markdown 回退
- `stdout` 输出 Markdown，可选保存到文件
- 可选下载 adapter 返回的图片/视频并重写 Markdown 链接
- Chrome profile 默认对齐 `baoyu-skills/chrome-profile`

## 安装

```bash
bun install
```

## 用法

```bash
bun run src/cli.ts https://example.com
baoyu-markdown https://example.com --output article.md
baoyu-markdown https://example.com --output article.md --download-media
baoyu-markdown https://x.com/jack/status/20 --json
baoyu-markdown https://x.com/jack/status/20 --chrome-profile-dir ~/Library/Application\\ Support/baoyu-skills/chrome-profile
```

## 主要参数

```bash
baoyu-markdown <url> [options]

Options:
  --output <file>       保存 markdown 到文件
  --json                以 JSON 输出结构化结果
  --adapter <name>      强制使用指定 adapter（如 x / generic）
  --download-media      下载 adapter 返回的媒体并重写 markdown 链接
  --media-dir <dir>     指定媒体下载根目录；默认使用 markdown 文件所在目录
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
7. 统一渲染为 Markdown

## 开发

```bash
bun run check
bun run test
bun run build
```
