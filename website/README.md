# rtex-ts website

Independent React + Ant Design 6.7 site. Its private package, dependencies and output never ship in the rtex-ts npm archive.

```sh
npm ci --prefix website
npm run dev --prefix website
PAGES_BASE_PATH=/rtex-ts/ npm run build --prefix website
```

Product copy lives in `src/i18n.ts`; docs import the repository English/Simplified Chinese Markdown directly. Routes use `#/en/…` and `#/zh-CN/…` so GitHub Pages deep links survive reloads. Intl formats numbers, milliseconds and dates. Theme/language are stored locally. No analytics or remote document processing is included.

The site uses Ant Design components and tokens, a quiet bright-red/neutral technical palette, a measured latency panel, and a responsive reading layout. Test at 1440px/390px, both languages/themes, keyboard navigation, search, copy failures and the `/rtex-ts/` base path. Performance claims must link measurement conditions and must not reuse upstream benchmark numbers.

`.github/workflows/pages.yml` builds site changes and Markdown updates; only main deploys to GitHub Pages. Repository Pages must use GitHub Actions. Branch builds and local builds are not deployment evidence. The root tarball integration test checks website exclusion.

# 简体中文

这是使用 React 与 Ant Design 6.7 的独立产品／文档站。独立 private 包、依赖与构建输出不得进入 rtex-ts npm 包。

上述命令分别安装、预览和按 GitHub Pages 子路径构建。产品文案位于 `src/i18n.ts`，文档直接导入仓库中英文 Markdown；哈希路由支持刷新深链接。Intl 负责数字、毫秒和日期本地化，语言／主题仅保存在本机，没有分析追踪与远程文档处理。

使用 Ant Design 组件和 token、亮红／中性技术色板、实测延迟区块与响应式阅读布局。验收 1440px／390px、中英、明暗、键盘、搜索、复制失败和 `/rtex-ts/` 子路径。性能数字须链接测量条件，不得沿用上游数据。

工作流自动构建站点与 Markdown 更新，仅 main 部署；仓库 Pages 需选择 GitHub Actions。分支／本地构建不是部署证据；根目录压缩包集成测试负责排除网站内容。
