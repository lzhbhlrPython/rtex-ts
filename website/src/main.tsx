import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Drawer,
  Empty,
  Input,
  Menu,
  Modal,
  Select,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  ArrowRightOutlined,
  CheckOutlined,
  CodeOutlined,
  GithubOutlined,
  MenuOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from "@ant-design/icons";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docs, docLink, documentText, type Locale } from "./content";
import { text } from "./i18n";
import pkg from "../../package.json";
import "./style.css";
const github = "https://github.com/lzhbhlrPython/rtex-ts";
const api = `import { Session } from 'rtex-ts';\n\nconst session = await Session.open({\n  projectRoot: '/path/to/project',\n  mainFile: 'main.tex',\n});\n\nsession.subscribe(event => {\n  if (event.event === 'ParagraphUpdate') {\n    renderGlyphs(event.dl, event.fragments);\n  }\n});\n\nsession.setDocument('main.tex', unsavedSource);\nsession.close();`;
function useRoute() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const update = () => {
      setRoute(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}
function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
function Code({ value, locale }: { value: string; locale: Locale }) {
  const { message } = AntApp.useApp();
  const t = text[locale];
  return (
    <div className="code">
      <Button
        className="copy"
        size="small"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => message.success(t.copied),
            () => message.error(t.copyFail),
          )
        }
      >
        {t.copy}
      </Button>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
function Site() {
  const hash = useRoute(),
    bits = hash.replace(/^#\//, "").split("/");
  const [fallbackLocale] = useState<Locale>(() =>
    localStorage.getItem("rtex-language") === "en"
      ? "en"
      : localStorage.getItem("rtex-language") === "zh-CN"
        ? "zh-CN"
        : navigator.language.startsWith("zh")
          ? "zh-CN"
          : "en",
  );
  const locale: Locale =
    bits[0] === "en" ? "en" : bits[0] === "zh-CN" ? "zh-CN" : fallbackLocale;
  const [dark, setDark] = useState(
    () => localStorage.getItem("rtex-theme") === "dark",
  );
  const [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState("");
  const docId = bits[1] === "docs" ? bits[2] || "start" : null,
    t = text[locale];
  const number = (value: number, decimals = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(
      value,
    );
  const ms = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "millisecond",
      maximumFractionDigits: 2,
    }).format(value);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("rtex-language", locale);
    localStorage.setItem("rtex-theme", dark ? "dark" : "light");
    document.title = `rtex-ts · ${docId ? docs.find((d) => d.id === docId)?.title[locale] || t.docs : t.title}`;
  }, [locale, dark, docId, t]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !/INPUT|TEXTAREA|SELECT/.test(target.tagName) &&
        !target.isContentEditable
      ) {
        event.preventDefault();
        setSearch(true);
      }
    };
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  }, []);
  const to = (path: string) => `#/${locale}/${path}`,
    go = (path: string) => {
      location.hash = to(path);
      setDrawer(false);
      setSearch(false);
      setQuery("");
    };
  const matches = useMemo(
    () =>
      docs.filter((doc) =>
        (doc.title[locale] + " " + documentText(doc.id, locale))
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale)),
      ),
    [locale, query],
  );
  const content = docId ? documentText(docId, locale) : "",
    headings = [...content.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-");
  const nav = (
    <>
      <Button type="text" href={to("docs/start")}>
        {t.docs}
      </Button>
      <Button type="text" href={to("docs/performance")}>
        {t.performance}
      </Button>
      <Button type="text" icon={<GithubOutlined />} href={github}>
        {t.source}
      </Button>
    </>
  );
  const palette = dark
    ? {
        bg: "#18181b",
        surface: "#222226",
        ink: "#f6f5f5",
        muted: "#c2bec0",
        border: "#494348",
        brand: "#ff5964",
      }
    : {
        bg: "#f8f8f9",
        surface: "#ffffff",
        ink: "#29272b",
        muted: "#68616a",
        border: "#e1dce0",
        brand: "#e51f2a",
      };
  const vars = {
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--ink": palette.ink,
    "--muted": palette.muted,
    "--border": palette.border,
    "--brand": palette.brand,
  } as CSSProperties;
  return (
    <ConfigProvider
      locale={locale === "zh-CN" ? zhCN : enUS}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: palette.brand,
          colorBgBase: palette.bg,
          colorTextBase: palette.ink,
          colorTextLightSolid: dark ? "#18181b" : "#ffffff",
          borderRadius: 6,
          controlHeight: 40,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 15,
        },
      }}
    >
      <AntApp>
        <div className="site" style={vars}>
          <a
            className="skip"
            href="#main"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("main")?.focus();
            }}
          >
            {t.docs}
          </a>
          <header className="header">
            <a className="brand" href={to("home")} aria-label="rtex-ts">
              <span className="brand-symbol">
                r<span>τ</span>
              </span>
              rtex<span className="brand-ts">/ts</span>
            </a>
            <nav className="desktop-nav" aria-label={t.nav}>
              {nav}
            </nav>
            <div className="header-tools">
              <Tooltip title={t.search}>
                <Button
                  type="text"
                  icon={<SearchOutlined />}
                  aria-label={t.search}
                  onClick={() => setSearch(true)}
                />
              </Tooltip>
              <Select
                className="locale-select"
                aria-label={t.language}
                value={locale}
                onChange={(value) => {
                  location.hash = `#/${value}/${docId ? "docs/" + docId : "home"}`;
                  setDrawer(false);
                }}
                options={[
                  { value: "zh-CN", label: "简体中文" },
                  { value: "en", label: "English" },
                ]}
              />
              <Tooltip title={t.theme}>
                <Button
                  type="text"
                  icon={dark ? <SunOutlined /> : <MoonOutlined />}
                  aria-label={t.theme}
                  onClick={() => setDark(!dark)}
                />
              </Tooltip>
              <Button
                className="mobile-menu"
                type="text"
                icon={<MenuOutlined />}
                aria-label={t.nav}
                onClick={() => setDrawer(true)}
              />
            </div>
          </header>
          <Drawer
            title="rtex-ts"
            open={drawer}
            onClose={() => setDrawer(false)}
          >
            <Menu
              items={[
                { key: "home", label: t.home },
                { key: "docs/start", label: t.docs },
                { key: "docs/performance", label: t.performance },
              ]}
              onClick={({ key }) => go(key)}
            />
            <Button href={github} icon={<GithubOutlined />}>
              {t.source}
            </Button>
            {docId && (
              <Menu
                items={docs.map((doc) => ({
                  key: "docs/" + doc.id,
                  label: doc.title[locale],
                }))}
                onClick={({ key }) => go(key)}
              />
            )}
          </Drawer>
          <Modal
            title={t.search}
            open={search}
            onCancel={() => {
              setSearch(false);
              setQuery("");
            }}
            footer={null}
            destroyOnHidden
          >
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchHint}
              aria-label={t.search}
            />
            <div className="search-results">
              {matches.length ? (
                matches.map((doc) => (
                  <Button
                    key={doc.id}
                    type="text"
                    block
                    onClick={() => go("docs/" + doc.id)}
                  >
                    {doc.title[locale]}
                    <ArrowRightOutlined />
                  </Button>
                ))
              ) : (
                <Empty description={t.noResults} />
              )}
            </div>
          </Modal>
          {docId ? (
            <main id="main" tabIndex={-1} className="docs-shell">
              <aside className="doc-nav">
                <a href={to("home")}>{t.home}</a>
                <h2>{t.docs}</h2>
                <Menu
                  selectedKeys={[docId]}
                  mode="inline"
                  items={docs.map((doc) => ({
                    key: doc.id,
                    label: (
                      <a href={to("docs/" + doc.id)}>{doc.title[locale]}</a>
                    ),
                  }))}
                />
                <span className="doc-version">rtex-ts {pkg.version}</span>
              </aside>
              <article className="markdown">
                {["upstream", "notices"].includes(docId) &&
                  locale === "zh-CN" && (
                    <p className="source-note">{t.englishSource}</p>
                  )}
                {content ? (
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href = "", children }) => (
                        <a
                          href={docLink(href, locale)}
                          onClick={(event) => {
                            if (href.startsWith("#")) {
                              event.preventDefault();
                              scrollToHeading(href.slice(1));
                            }
                          }}
                        >
                          {children}
                        </a>
                      ),
                      h2: ({ children }) => (
                        <h2 id={slug(String(children))}>{children}</h2>
                      ),
                      pre: ({ children }) => {
                        const element = children as React.ReactElement<{
                          children?: React.ReactNode;
                        }>;
                        return (
                          <Code
                            value={String(element.props.children || "").replace(
                              /\n$/,
                              "",
                            )}
                            locale={locale}
                          />
                        );
                      },
                    }}
                  >
                    {content}
                  </Markdown>
                ) : (
                  <Empty description={t.noResults} />
                )}
              </article>
              <aside className="toc">
                <p>{t.section}</p>
                {headings.map((heading) => (
                  <a
                    key={heading}
                    href={"#" + slug(heading)}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToHeading(slug(heading));
                    }}
                  >
                    {heading}
                  </a>
                ))}
              </aside>
            </main>
          ) : (
            <main id="main" tabIndex={-1}>
              <section className="hero wrap">
                <div className="hero-copy">
                  <Tag bordered={false} color={"red"}>
                    Node.js 22+ / TypeScript / MIT
                  </Tag>
                  <h1>{t.title}</h1>
                  <p className="intro">{t.intro}</p>
                  <div className="actions">
                    <Button
                      type="primary"
                      size="large"
                      icon={<ArrowRightOutlined />}
                      iconPlacement="end"
                      href={to("docs/start")}
                    >
                      {t.start}
                    </Button>
                    <Button size="large" href={to("docs/performance")}>
                      {t.measure}
                    </Button>
                  </div>
                  <div className="install">
                    <span>{t.install}</span>
                    <Typography.Text
                      code
                      copyable={{ text: "npm install rtex-ts@experimental" }}
                    >
                      npm install rtex-ts@experimental
                    </Typography.Text>
                  </div>
                </div>
                <div className="hero-proof">
                  <div className="proof-top">
                    <span>{t.measured}</span>
                    <CodeOutlined />
                  </div>
                  <div className="metric">
                    {number(4.80)}
                    <span>ms</span>
                  </div>
                  <p>{t.heroNote}</p>
                  <div className="latency-track">
                    <span style={{ width: "4.80%" }} />
                  </div>
                  <div className="track-label">
                    <span>0 ms</span>
                    <span>100 ms</span>
                  </div>
                  <p className="metric-note">{t.sampleNote}</p>
                  <a href={to("docs/performance")}>
                    {t.measure}
                    <ArrowRightOutlined />
                  </a>
                </div>
              </section>
              <section className="performance wrap">
                <div className="section-heading">
                  <h2>{t.latency}</h2>
                  <p>{t.latencyBody}</p>
                </div>
                <Table
                  pagination={false}
                  size="middle"
                  rowKey="pages"
                  columns={[
                    {
                      title: t.pages,
                      dataIndex: "pages",
                      render: (value) => number(value, 0),
                    },
                    {
                      title: t.p50,
                      dataIndex: "p50",
                      render: (value) => <strong>{ms(value)}</strong>,
                    },
                    {
                      title: t.p95,
                      dataIndex: "p95",
                      render: (value) => ms(value),
                    },
                    {
                      title: t.sync,
                      dataIndex: "sync",
                      render: (value) => ms(value),
                    },
                  ]}
                  dataSource={[
                    { pages: 10, p50: 1.80, p95: 2.39, sync: 0.39 },
                    { pages: 100, p50: 2.66, p95: 3.27, sync: 1.33 },
                    { pages: 300, p50: 4.80, p95: 5.61, sync: 3.38 },
                  ]}
                  scroll={{ x: 580 }}
                />
                <p className="caption">
                  {t.benchNote} {t.updated}{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "long",
                    timeZone: "Asia/Shanghai",
                  }).format(new Date("2026-11-11T00:00:00+08:00"))}
                  .
                </p>
              </section>
              <section className="flow-section">
                <div className="wrap">
                  <div className="section-heading">
                    <h2>{t.flowTitle}</h2>
                    <p>{t.flowBody}</p>
                  </div>
                  <div className="flow">
                    {[
                      [t.flow1, t.flow1body],
                      [t.flow2, t.flow2body],
                      [t.flow3, t.flow3body],
                    ].map(([title, body], index) => (
                      <React.Fragment key={title}>
                        {index > 0 && (
                          <ArrowRightOutlined className="flow-arrow" />
                        )}
                        <div className="flow-step">
                          <span className="flow-dot">
                            <CheckOutlined />
                          </span>
                          <h3>{title}</h3>
                          <p>{body}</p>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </section>
              <section className="api-section wrap">
                <div>
                  <h2>{t.api}</h2>
                  <p>{t.apiBody}</p>
                  <Button
                    href={to("docs/embedding")}
                    icon={<ArrowRightOutlined />}
                    iconPlacement="end"
                  >
                    {t.apiLink}
                  </Button>
                  <div className="local-note">
                    <h3>{t.local}</h3>
                    <p>{t.localBody}</p>
                  </div>
                </div>
                <Code value={api} locale={locale} />
              </section>
              <section className="closing wrap">
                <div>
                  <h2>{t.credit}</h2>
                  <p>{t.creditBody}</p>
                  <a href={to("docs/upstream")}>
                    {t.source}
                    <ArrowRightOutlined />
                  </a>
                </div>
                <div>
                  <h2>{t.limits}</h2>
                  <p>{t.limitsBody}</p>
                  <a href={to("docs/compatibility")}>
                    {t.readLimits}
                    <ArrowRightOutlined />
                  </a>
                </div>
              </section>
            </main>
          )}
          <footer className="footer">
            <div className="wrap">
              <span>rtex-ts {pkg.version}</span>
              <span>{t.footer}</span>
              <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`}>
                {t.thirdParty}
              </a>
              <a href={github}>GitHub</a>
            </div>
          </footer>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Site />
  </React.StrictMode>,
);
