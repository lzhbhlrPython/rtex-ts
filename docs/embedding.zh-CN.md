# 嵌入 rtex-ts

[English](embedding.md)

需要 Node.js 22+、另行安装的 LuaLaTeX 和文档使用的字体／宏包。宿主必须显式传入主文件；rtex-ts 不替宿主选择多个主文件，不切换编辑标签，也不改写工程配置。运行 TeX 的授权由宿主管理。

## 完整缓冲区示例

```js
import { readFile } from 'node:fs/promises';
import { Session } from 'rtex-ts';

const session = await Session.open({
  projectRoot: '/path/to/project',
  mainFile: 'main.tex',
  debounceMs: 300,
});
const stopListening = session.subscribe(event => {
  if (event.event === 'Diagnostics') console.error(event.items);
  // 绘制事件按会话身份与 versions 分发给视图。
});
const source = await readFile('/path/to/project/main.tex', 'utf8');
session.setDocument('main.tex', source.replace('Hello', 'Hello world'));
// 在编辑器生命周期内保持会话；关闭工程时：
// stopListening(); session.close();
```

`open` 在首次后台布局完成前返回，应立即订阅事件。初始内容从磁盘读取，未保存缓冲区由 `setDocument(path, text)` 提供。不会自动监听后续磁盘变更：源码变化由宿主重新传入，其他依赖变化时请求布局或重建会话。未完成源码仍留在内存中，可以产生诊断并保留最近有效布局。

## 库接口

`Session.open(config)` 接收 `projectRoot`、`mainFile`，以及可选的 `buildDir`、`lualatex`、`debounceMs`（300）、`compileTimeoutMs`（5000）、`passTimeoutMs`（120000）、`maxPasses`（5）、`maxSourceBytes`（每文件 4 MiB）和 `fastBudgetMs`（50）。初始源文缓冲区另有合计 64 MiB 限制；快照限制为 256 MiB 与 10,000 个文件。非法路径、限制和编辑会抛出异常。

- `setDocument(path, text)` 计算一次最小修改，立即返回 `EditResult`。
- `applyEdit(path, { start, end, text })` 替换 `[start, end)` 范围的 **UTF-8 字节**；切开字符、越界或倒置范围都会被拒绝。
- `documentText(path)` 返回会话中的最新缓冲区，包含未保存修改。
- `spans(path)` 返回源单元 ID、字节范围、文本与行号；这是保守的宿主单元，不是完整 TeX AST。
- `versions()`、`status()` 提供修订及收敛状态。
- `requestLayout()` 立即安排完整布局，不保存源文件。
- `exportPdf(out)` 在不加载采集宏包的情况下重新执行普通 LuaLaTeX，返回 `{ path, converged }`；`converged: false` 不代表已收敛。
- `subscribe(listener)` 返回取消订阅函数，也可以使用 Node EventEmitter 的 `event` 通道。
- `close()` 可以重复调用，会取消定时器并结束本会话进程组（POSIX）或进程树（Windows），不删除作者文件或导出结果。

默认构建目录是工程内 `.rtex-ts/<会话 UUID>`。需要其他缓存策略的宿主应提供独立会话目录。资源和 PDF 保留近期布局；后台快照保留最近三轮和实时引擎仍占用的一轮。会话关闭且图像／字体资源释放后，最终缓存清理由宿主控制。

## 事件与顺序

`ParagraphUpdate` 替换一个 `par_id`。`dl` 提供字形显示列表，`fragments` 提供行到页面的放置；先移除旧行再绘制新行。`removed` 表示源码单元已删除。`pagination_stale`、`context_stale` 或片段的 `approximate` 标记说明全局定位暂未校正。

`LayoutUpdate` 提供 `pages_changed`、`pages_total`、`placements`、`eligible_paragraphs`、编译状态、收敛状态与 `pdf_path`。PDF 是本轮布局的不可变副本。显示列表含未知绘制操作时设置 `pdf_fallback`；宿主无法处理字体格式时，也可使用 `pdf_path`。失败时保留旧页面，页数减少时移除多余页面。三个较新布局之后，旧 PDF 可能被清理，应及时读取或复制。

`Diagnostics` 替换其来源的旧列表，空列表用于清除诊断。`EngineState` 报告启动、就绪、重启或失败。`BackgroundScheduled` 解释等待完整排版的原因。`PdfExported` 报告正式导出。诊断可能包含工程路径或源码片段，未经作者许可不得发送到远端服务。

每个绘制事件携带 `source_revision`、`context_revision`、`engine_generation` 与 `layout_version`。宿主另需维护工程／会话身份，不用旧段落覆盖新输入，也不用旧后台快照覆盖较新的实时层。会话会拒绝对应段落已再次变化的结果；视图事件顺序、关闭和取消仍由宿主管理。

## 绘制

坐标使用 TeX scaled point：65536 sp = 1 pt，65781.76 sp = 1 PDF point；Y 轴向下。按指定字体文件、字形 ID、大小和坐标绘制，不能用浏览器 `fillText()` 重新排字代替。需要处理字体集合、倾斜、伸缩、字体扩展、颜色、规则线和图像变换。

片段的 `first_line..last_line` 是从 1 开始的闭区间。第 j 行的平移量为 `fragment.xs[j] - line.x` 和 `fragment.baselines[j] - line.y`。后台页面的 `line.unit` 是排版采集 ID，**不是**宿主的 `par_id`；替换源单元时使用 `placements` 与行坐标。

含原始 PDF 指令或未知绘制操作的页面使用 PDF。Type 1 字体可能没有字形索引，无法解码的宿主也必须回退 PDF；不能悄悄丢弃未知记录或替换字体。本包不包含命中测试、SyncTeX、编辑器或 PDF.js，宿主应根据匹配版本的布局实现这些能力。

## 命令行协议

```sh
rtex-ts serve --project /path/to/project --main main.tex --build /path/to/session-cache
```

支持 `set_document`、`edit`、`spans`、`status`、`request_layout`、`export_pdf` 与 `quit`。字段见 README，`export_pdf` 要求 `out`，`spans` 使用 `path`。成功回复会回传可选 `id`；失败使用 `{ "reply": "error", "message": "..." }`，未知命令被拒绝。绘制事件使用 `event` 字段。事件与回复可能交错，需要持续读取 stdout。

stdin 关闭时结束会话，stdout 仅输出 JSON-lines。慢消费者的待输出数据上限为 64 MiB。协议借鉴上游，但只实现一个子集：没有 C ABI、后台暂停 API、Rust 依赖、自动参考文献／索引工具调度或上游 API 兼容性承诺。

## 安全与分发

工程路径和源码符号链接逃逸会被校验，进程使用参数数组。它们保护宿主接口，不能把 LuaLaTeX 变成沙箱。文档可执行 Lua，并以用户权限读写文件；处理不可信工程时需要操作系统隔离。

分发时包含 `dist/`、Lua/TeX 支持目录、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`UPSTREAM.md`、上游许可与校验清单。Electron 宿主需将支持文件解包到 ASAR 外供 LuaLaTeX 读取，Node 能力经 preload/IPC 隔离，并避免在渲染线程运行会话。保留上游署名；npm 包不包含 Rust 二进制、TeX 发行版或字体。
