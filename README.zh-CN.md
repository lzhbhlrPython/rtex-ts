# rtex-ts

用 TypeScript 实现的实验性 Node.js 增量 LuaLaTeX 会话库。

[English](README.md) · [嵌入指南](docs/embedding.zh-CN.md) · [架构](docs/architecture.zh-CN.md) · [上游代码与研究来源](UPSTREAM.md)

**本项目高度参考 Henry Yang 及贡献者的 [realtime-tex](https://github.com/HenryXiaoYang/realtime-tex)。** Lua/TeX 运行层保留上游源码与 MIT 许可；实时段落排版技术来自 [Clemens Lode 的 TUG 2026 论文](https://www.tug.org/tug2026/preprints/lode-realtime.pdf)。这是独立、能力范围较小的 TypeScript 改写，不是上游官方发行版，也不宣称完整移植了所有功能。

## 工作方式

会话常驻一个已加载导言区的 LuaLaTeX 进程，用最近完整排版采集的上下文重排普通段落，返回带字体和坐标的真实字形。独立后台编译基于当前缓冲区的不可变快照更新页面、分页和引用；无法可靠处理的修改等待完整布局。

JavaScript 运行层**没有 npm 运行时依赖**，不依赖 Rust、VS Code 或 Electron。需要另行安装 LuaLaTeX，以及文档所需宏包与字体。项目内容不会发送到托管服务。

## 安装

需要 **Node.js 22+** 和 LaTeX 内核不早于 2021 年的 LuaLaTeX。真实集成测试当前使用 TeX Live；尚未验证 MiKTeX。

```sh
npm install rtex-ts@experimental
npx rtex-ts doctor
```

LuaLaTeX 不在 `PATH` 时，将 `RTEX_TEXLIVE_BIN` 设为其二进制目录，或通过库配置的 `lualatex` 传入路径。macOS 还会检查 `/Library/TeX/texbin/lualatex`。

## 在 Node 中使用

```js
import { Session } from 'rtex-ts';

const session = await Session.open({
  projectRoot: '/path/to/project',
  mainFile: 'main.tex',
});
const unsubscribe = session.subscribe(event => {
  if (event.event === 'ParagraphUpdate') {
    // 用 event.dl 和 event.fragments 替换这个单元的旧行。
  }
  if (event.event === 'LayoutUpdate') {
    // 安装更新的页面；event.pdf_path 是当前布局的不可变 PDF。
  }
});

// 传入完整未保存缓冲区，会话自行计算最小 UTF-8 修改。
session.setDocument('main.tex', updatedSource);
// 或修改字节 123..123；这里是 UTF-8 字节位置，不是 JS 字符串位置。
session.applyEdit('main.tex', { start: 123, end: 123, text: ' world' });

// 宿主结束本次编辑会话时：
unsubscribe();
session.close();
```

`setDocument`、`applyEdit` 立即返回路由信息；渲染和诊断通过异步事件返回。两者不会保存源文件。结束会话时调用 `close()` 清理本地 TeX 进程。[嵌入指南](docs/embedding.zh-CN.md)给出了完整缓冲区示例、生命周期、事件顺序、绘制和正式 PDF 导出说明。

## 命令行

```sh
rtex-ts serve --project /path/to/project --main main.tex
```

向 stdin 每行发送一个 JSON 对象：

```json
{"cmd":"set_document","path":"main.tex","text":"...完整缓冲区..."}
{"cmd":"edit","path":"main.tex","start":123,"end":123,"text":" world"}
{"cmd":"request_layout"}
{"cmd":"status"}
{"cmd":"quit"}
```

stdout 只包含 JSON 回复和事件，诊断写入 stderr。完整命令及与上游的差异见嵌入指南。

## 当前边界

- 只支持 **LuaLaTeX**，不支持 pdfLaTeX 或 XeLaTeX。
- 实时更新针对普通段落与行内数学。命令采用保守白名单，并先将旧段落的试排结果与完整布局比较；无法确认的结果进入后台路径。
- 标题、块环境（包括表格和 TikZ）、自定义宏与结构修改目前等待后台排版。段落变高或变矮时，垂直位置在下一次布局前属于暂定结果。
- 图稿或宿主无法绘制的字体格式需要 PDF 回退。本包返回显示列表，不包含查看器。
- 尚未移植参考文献／索引工具调度、后台预热引擎、图稿缓存调度和上游更广的实时适用性逻辑。缺失参考文献或索引输出不能算作布局已收敛。
- 响应文件传输在等待回复时轮询，会增加开销；上游毫秒级测试数据不是本包实测数据。
- Linux/macOS/Windows 使用 Node API 和分别处理的进程清理，附有 CI 矩阵；实际验证范围见[兼容性说明](docs/compatibility.zh-CN.md)。
- LuaLaTeX 以当前用户权限执行文档代码。本库**不是沙箱**；打开不可信工程的宿主需要自行提供操作系统隔离。

## 开发

```sh
npm ci
npm test
npm run typecheck
npm run test:tex
npm pack --dry-run
```

真实 TeX 测试需要带 Fandol 字体的 `ctex`、`unicode-math` 和 TikZ，使用临时工程，缺少 LuaLaTeX 时明确失败。纯单元测试不依赖 TeX。协作规则见 [AGENTS.md](AGENTS.md)。

## 许可与来源

采用 MIT 许可。再分发时保留完整[许可](LICENSE)、上游版权和[第三方声明](THIRD_PARTY_NOTICES.md)。[UPSTREAM.md](UPSTREAM.md)逐项记录复制文件、改写模块、上游提交与论文来源。外部 TeX 引擎和字体保留各自许可，不表示上游隶属或官方背书。
