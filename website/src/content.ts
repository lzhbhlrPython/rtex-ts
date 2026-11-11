export type Locale = "zh-CN" | "en";
const markdown = {
  ...import.meta.glob("../../docs/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("../../README*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob(
    "../../{UPSTREAM,THIRD_PARTY_NOTICES,CHANGELOG,CHANGELOG.zh-CN}.md",
    { query: "?raw", import: "default", eager: true },
  ),
} as Record<string, string>;
export const docs = [
  {
    id: "start",
    title: { "zh-CN": "开始使用", en: "Getting started" },
    file: "README",
  },
  {
    id: "embedding",
    title: { "zh-CN": "嵌入你的应用", en: "Embedding guide" },
    file: "docs/embedding",
  },
  {
    id: "performance",
    title: { "zh-CN": "性能与测量", en: "Performance" },
    file: "docs/performance",
  },
  {
    id: "architecture",
    title: { "zh-CN": "架构与数据流", en: "Architecture" },
    file: "docs/architecture",
  },
  {
    id: "compatibility",
    title: { "zh-CN": "平台与兼容性", en: "Compatibility" },
    file: "docs/compatibility",
  },
  {
    id: "upstream",
    title: { "zh-CN": "上游与研究来源", en: "Upstream & research" },
    file: "UPSTREAM",
  },
  {
    id: "notices",
    title: { "zh-CN": "第三方声明", en: "Third-party notices" },
    file: "THIRD_PARTY_NOTICES",
  },
  {
    id: "changelog",
    title: { "zh-CN": "更新记录", en: "Changelog" },
    file: "CHANGELOG",
  },
] as const;
export function documentText(id: string, locale: Locale) {
  const doc = docs.find((doc) => doc.id === id);
  if (!doc) return "";
  const suffix =
    locale === "zh-CN" &&
    !["UPSTREAM", "THIRD_PARTY_NOTICES"].includes(doc.file)
      ? ".zh-CN"
      : "";
  return markdown["../../" + doc.file + suffix + ".md"] || "";
}
export function docLink(href: string, locale: Locale) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const name = href
    .split("#")[0]
    .replace(/^.*\//, "")
    .replace(/\.zh-CN\.md$|\.md$/, "");
  const doc = docs.find((doc) => doc.file.split("/").at(-1) === name);
  return doc
    ? `#/${locale}/docs/${doc.id}`
    : "https://github.com/lzhbhlrPython/rtex-ts/blob/main/" +
        href.replace(/^\.\.\//, "");
}
