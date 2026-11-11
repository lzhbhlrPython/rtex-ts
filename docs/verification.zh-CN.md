# CLI 与 PDF 验证

[English](verification.md)

`verify` 将 LuaLaTeX 实时候选单元的探针结果与捕获版面对照。每个候选都必须匹配、结果不能过期；候选为空时 CLI 判为失败。这不等于整篇文档已经通过验证。

```sh
rtex-ts verify --project ./paper --main main.tex
rtex-ts verify --project ./paper --main main.tex --pdf
rtex-ts pdf-compare --a baseline.pdf --b candidate.pdf --dpi 144
rtex-ts profile --project ./paper --main main.tex
```

0.1.11 起，`verify --pdf` 还会把捕获 PDF 与同一缓冲区独立、已收敛的普通导出 PDF 比较。`pdf-compare` 可比较任意引擎生成的 PDF。两者需要**可选的外部 Poppler**（`pdfinfo`、`pdftoppm`）；请单独安装，或传入 `--pdfinfo PATH --pdftoppm PATH`。缺少工具、PDF 无效、超时、超过限制都会失败并向 stderr 输出诊断，不能算作通过。JSON 结果写入 stdout；匹配时退出码为 0，不匹配或执行失败时为 1。

对照工具逐页比较 RGB 渲染像素，默认 96 dpi（范围 36–300）。不影响渲染的字节、元数据变化不会导致失败；页数或栅格尺寸变化始终失败。`--tolerance N` 允许每像素最大颜色通道差异（0–255）；`--max-different-ratio R` 允许超过该容差的像素比例（0–1）。两项默认均为**零**。JSON 记录阈值、像素尺寸、不同像素数量/比例和最大通道差异。阈值是调用方明确选择的验收策略，不能证明等价。图片缓存边缘可能存在抗锯齿差异，不应静默放宽失败测试。

这是**栅格对照**，尚非完整上游 PDF 套件：还没有解码内容流/资源/字体比较，也没有 PDF 字形与显示列表的对照工具。有限分辨率渲染不能证明数学、结构、文本可访问性或所有缩放级别的一致性；实时单元探针仍独立执行。

每份输入最多 64 MiB、100 页；每页最多 2000 万像素，总比较上限 2 亿像素。进程输出有界，每个命令超时为 30 秒；比较后删除临时渲染页。Poppler 以调用方权限解析 PDF，此工具不是沙箱。宿主可调用导出的 `comparePdfs(a, b, options)`，包括程序路径覆盖和 `timeoutMs`。

`profile` 输出 Node 内存/CPU 快照及 `startup.first_layout_ms` / `startup.ready_ms`。启动耗时从会话构造开始，包含源码读取；XeLaTeX/pdfLaTeX 没有实时引擎的 `ready_ms`。这些指标不包含宿主绘制，也不代表整个 TeX 进程树的内存。运行 `npm run benchmark:startup -- --samples 5 --out .ai-notes/startup.json` 可复现启动对照。
