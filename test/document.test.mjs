import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyByteEdit, minimalEdit, maskTeX, splitPreamble, splitSpans } from '../dist/index.js';

test('UTF-8 edits preserve CJK, emoji, combining marks, CRLF and control characters', () => {
  const cases = [['中文😀尾','中文😁尾'],['a\r\n中文','a\r\n英語'],['😀abc😁','😁ab😃😁'],['é e\u0301','é a\u0301'],['abc',''],['','你好'],['😀😀','😀'],['x😀tail','x😄tail'],['a\u001az','b\u001az']];
  for (const [before, after] of cases) assert.equal(applyByteEdit(before, minimalEdit(before, after)), after);
  assert.equal(minimalEdit('same','same'), null);
  for (const edit of [{start:1,end:1,text:'x'},{start:-1,end:0,text:''},{start:0,end:9,text:''},{start:4,end:0,text:''},{start:0.5,end:1,text:''}]) assert.throws(() => applyByteEdit('😀',edit));
});
test('comments, escapes and verbatim cannot invent document boundaries', () => {
  const source = String.raw`% \begin{document}
\documentclass{article}
\begin{document}
Text \% visible. \verb|\end{document}| remains text.
\begin{verbatim}
\end{document}
\end{verbatim}
\end{document}`;
  assert.equal(splitPreamble(source).preamble, '% \\begin{document}\n\\documentclass{article}\n');
  assert.equal(maskTeX(source).length,source.length);
  assert.ok(maskTeX(source).includes('\\% visible'));
});
test('balanced groups do not split at nested blank lines and incomplete source stays editable', () => {
  const spans=splitSpans('One {nested\n\ntext}.\n\nTwo.');
  assert.equal(spans.length,2);assert.ok(spans[0].text.includes('nested\n\ntext'));
  assert.equal(splitSpans('\\documentclass{article}\n\\begin{doc',true)[0].kind,'preamble');
  assert.equal(splitSpans('\\begin{verbatim}\n\ncode\n\\end{verbatim}')[0].kind,'unsupported');
  assert.equal(splitSpans('Text {unfinished')[0].kind,'unsupported');
});
