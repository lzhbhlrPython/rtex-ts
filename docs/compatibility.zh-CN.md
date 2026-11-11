# 兼容性与验证

[English](compatibility.md)

需要 Node.js 22+、独立安装的 LuaLaTeX、2021 年或更新的 LaTeX 内核，以及文档所需宏包和字体。`doctor` 检查可执行文件和支持文件，不证明所有文档依赖均已安装。

| 平台 | 实现方式 | 验证证据（0.1.5） |
| --- | --- | --- |
| macOS ARM64 | Node 文件和进程 API、MacTeX 默认路径、POSIX 进程组 | 本机单元测试、真实 CTeX/Fandol、行内数学、多文件、TikZ 及普通导出；TeX Live 2023 |
| Linux | PATH 或指定引擎、POSIX 进程组 | 链接的运行记录中，Node 22/24/26 单元及安装包矩阵与真实 TeX Live 集成通过 |
| Windows | `.exe` 查找、平台路径分隔符、JSON stdin、taskkill 进程树 | Node 22/24/26 单元及安装包矩阵与真实 TeX Live 集成通过，包含中文 Fandol、实时数学、导出及拥有进程清理 |
| macOS Intel / 其他架构 | 没有原生 npm 依赖或内置架构特定程序 | 未在本机运行验证 |

[CI 运行 42963945598](https://github.com/lzhbhlrPython/rtex-ts/actions/runs/42963945598) 验证提交 `59d77fc`（0.1.5）：九组 Node 22/24/26 单元和压缩包安装作业，以及 Linux、macOS、Windows 的真实 TeX Live 集成全部通过。Actions 使用 Node 24 运行时。证据仅对应这次提交和测试场景，后续引擎改动仍需重新验证。

MiKTeX 未验证；0.1.7 新增 XeLaTeX/pdfLaTeX 的 PDF 路径，仍需对应新场景在各平台 CI 通过。本地 Biber 2.19 验证使用从原文件提取的 ARM64 可执行文件，因已安装通用启动器自身的 `lipo` 步骤失败；未更改 TeX 安装。路径含 TeX 特殊字符 `% # { } ~ "` 或换行时拒绝。TeX 语法、文档类和字体可能有额外路径约束，建议使用简单工程名。拒绝指向工程外的符号链接文件，不递归复制符号链接目录。可信文档中已有的绝对外部引用由作者负责。

单元测试覆盖 UTF-8、中文、emoji、CRLF、控制字符、平衡范围、未完成输入、注释和逐字内容、二进制损坏、源码身份、路径、程序缺失、进程超时与清理、上游文件完整性和 CLI 协议。安装包测试离线安装实际 npm 压缩包，检查 ESM API、CLI 和支持文件。真实 TeX 测试使用临时工程，验证实时更新、后台回退、不改写原文及导出。

可复现的 rtex-ts 延迟测量、测试文档和边界见[性能说明](performance.zh-CN.md)。上游论文和 Rust 项目的延迟数据不是本实现测量值；单次集成计时只作为功能验证证据。
