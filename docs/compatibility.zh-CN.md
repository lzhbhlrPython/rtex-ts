# 兼容性与验证

[English](compatibility.md)

需要 Node.js 22+、独立安装的 LuaLaTeX、2021 年或更新的 LaTeX 内核，以及文档所需宏包和字体。`doctor` 检查可执行文件和支持文件，不证明所有文档依赖均已安装。

| 平台 | 实现方式 | 验证证据（0.1.7） |
| --- | --- | --- |
| macOS ARM64 | Node 文件和进程 API、MacTeX 默认路径、POSIX 进程组 | 本机单元测试、真实 CTeX/Fandol、行内数学、多文件、TikZ 及普通导出；TeX Live 2023 |
| Linux | PATH 或指定引擎、POSIX 进程组 | 链接的运行记录中，Node 22/24/26 单元及安装包矩阵与真实 TeX Live 集成通过 |
| Windows | `.exe` 查找、平台路径分隔符、二进制请求/响应管道、taskkill 进程树 | Node 22/24/26 单元及安装包矩阵与真实 TeX Live 集成通过，包含中文 Fandol、实时数学、导出及拥有进程清理 |
| macOS Intel / 其他架构 | 没有原生 npm 依赖或内置架构特定程序 | 未在本机运行验证 |

[CI 运行 43005073072](https://github.com/lzhbhlrPython/rtex-ts/actions/runs/43005073072) 验证提交 `cc78494`（0.1.7）：九组 Node 22/24/26 单元/压缩包安装作业，以及 Linux、macOS、Windows 真实 TeX Live 集成全部通过。真实场景包含 Lua 实时/中文/数学、Windows 二进制请求、常驻后台缓冲区更新、BibTeX/Biber、makeindex/命名 imakeidx、XeLaTeX/pdfLaTeX 嵌套文件 PDF 布局和普通导出。Actions 使用 Node 24 运行时。证据只对应该提交及测试场景；0.1.8 图片缓存另有新运行验证。

MiKTeX 未验证。本地 Biber 2.19 验证使用从原文件提取的 ARM64 可执行文件，因已安装通用启动器自身的 `lipo` 步骤失败；未更改 TeX 安装。路径含 TeX 特殊字符 `% # { } ~ "` 或换行时拒绝。TeX 语法、文档类和字体可能有额外路径约束，建议使用简单工程名。拒绝指向工程外的符号链接文件，不递归复制符号链接目录。可信文档中已有的绝对外部引用由作者负责。

单元测试覆盖 UTF-8、中文、emoji、CRLF、控制字符、平衡范围、未完成输入、注释和逐字内容、二进制损坏、源码身份、路径、程序缺失、进程超时与清理、上游文件完整性和 CLI 协议。安装包测试离线安装实际 npm 压缩包，检查 ESM API、CLI 和支持文件。真实 TeX 测试使用临时工程，验证实时更新、后台回退、不改写原文及导出。

可复现的 rtex-ts 延迟测量、测试文档和边界见[性能说明](performance.zh-CN.md)。上游论文和 Rust 项目的延迟数据不是本实现测量值；单次集成计时只作为功能验证证据。

[0.1.8 CI 43017176258](https://github.com/lzhbhlrPython/rtex-ts/actions/runs/43017176258) 已通过九项 Node 矩阵与三平台真实 TeX，包含图片缓存、隔离及清理用例。这是 `c6cccdd` 的证据，不代替 0.1.9 的验证。新增 Poppler 对照需要单独安装；CI 的新 Linux 对照任务不代表 macOS/Windows Poppler 已通过验收。
