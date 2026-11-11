import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import { groupAt, texTokens } from '../dist/tex-syntax.js';
import { Policy, everyparAllowed } from '../dist/eligibility.js';
import { effectivePreamble, setupStatements } from '../dist/preamble.js';
import { splitSpans } from '../dist/document.js';
import { readAuxLabels, AuxiliaryTools, indexCommand } from '../dist/auxiliary.js';
test('balanced scanner respects nested arguments, escaped delimiters, comments and verbatim',()=>{
 assert.equal(groupAt('{a {b} \\} c}',0).value,'a {b} \\} c');
 assert.equal(groupAt('[a {]} nested [b]]',0,'[',']').value,'a {]} nested [b]');
 assert.equal(groupAt('{unclosed',0),undefined);
 assert.deepEqual([...texTokens('text % \\begin{fake}\n\\verb|{\\bad}| \\begin{verbatim}\\bad{\\end{verbatim}')].filter(t=>t.kind==='opaque').map(t=>t.value),['verb','verbatim']);
 const spans=splitSpans('Hello $a\n\nb$.\n\n\\section{Title {nested}}\nText.\n\n\\begin{itemize}\n\\item One.\n\n\\item Two.\n\\end{itemize}');
 assert.deepEqual(spans.map(s=>s.kind),['paragraph','heading','paragraph','environment']);
 assert.equal(splitSpans('A $unfinished\n\ntext').at(-1).kind,'unsupported');
});
test('policy keeps group/environment/state restrictions with vocabulary probes',()=>{
 const policy=new Policy('\\usepackage{amsmath}\n\\newtheorem{theorem}{Theorem}');
 assert.deepEqual(policy.classify('Text $\\alpha+1$.').reasons,[]);
 for(const source of ['\\global\\def\\x{a}','{unfinished','\\begin{theorem}missing end','\\attribute42=1 x','\\paragraph{Run-in}'])assert.ok(policy.classify(source).reasons.length,source);
 assert.deepEqual(policy.classify('\\begin{theorem}An assertion.\\end{theorem}').reasons,[]);
 assert.deepEqual(new Policy('',{eligibility:'probe'}).classify('\\unknown{text}').reasons,[]);
 assert.ok(new Policy('',{eligibility:'allowlist'}).classify('\\unknown{text}').reasons.length);
 assert.equal(everyparAllowed('\\untrusted'),false);
});
test('effective preamble follows input buffers and body setup only from reachable standalone units',()=>{
 const files=new Map(Object.entries({'main.tex':{text:'\\documentclass{article}\n\\input{preamble}\n\\begin{document}\n\\newcommand{\\body}{Body {nested}}\n\n\\input{chapter}\n\\end{document}'},'preamble.tex':{text:'\\usepackage{amsmath}'},'chapter.tex':{text:'\\newcommand{\\chaptermacro}{Chapter}\n\n\\begin{itemize}\n\\newcommand{\\local}{No}\n\\item One\n\\end{itemize}'},'unused.tex':{text:'\\newcommand{\\unused}{No}'}}));
 const preamble=effectivePreamble(files,'main.tex');assert.match(preamble,/usepackage\{amsmath\}/);assert.match(preamble,/chaptermacro/);assert.match(preamble,/\\body/);assert.doesNotMatch(preamble,/\\unused|\\local/);
 assert.equal(setupStatements('\\newcommand{\\a}{A} prose'),undefined);
 assert.ok(setupStatements('\\def\\a#1{Nested {#1}}\n\\setlength{\\parindent}{0pt}'));
 files.get('preamble.tex').text='\\input{main}';assert.throws(()=>effectivePreamble(files,'main.tex'),/Cyclic/);
});
test('aux labels preserve nested values and auxiliary tools use controlled commands',async t=>{
 const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-aux-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'out'));
 fs.writeFileSync(path.join(root,'out/main.aux'),'\\newlabel{x}{{{nested}}{2}}\n\\bibdata{refs}\n\\bibstyle{plain}\n\\citation{key}\n');
 assert.deepEqual(readAuxLabels(path.join(root,'out/main.aux')),[['r@x','{{nested}}{2}']]);
 fs.writeFileSync(path.join(root,'out/main.idx'),'\\indexentry{term}{1}');const calls=[];
 const tools=new AuxiliaryTools({run:async(exe,args,cwd)=>{calls.push({exe,args,cwd});if(/bibtex(?:\.exe)?$/.test(exe))fs.writeFileSync(path.join(root,'out/main.bbl'),'bibliography');else fs.writeFileSync(path.join(root,'out/main.ind'),'index');return{code:0,log:''};}},'/bin/lualatex',1000);
 await tools.run(root,'main.tex',path.join(root,'out'),{});await tools.run(root,'main.tex',path.join(root,'out'),{});assert.equal(calls.length,2);assert.ok(calls.every(call=>Array.isArray(call.args)&&path.isAbsolute(call.cwd)));
});
test('package vocabulary, opaque arguments and recursive macro definitions retain policy guards',()=>{
 const policy=new Policy('\\usepackage{hyperref}\\newcommand{\\strong}[1]{\\textbf{#1}}\\newcommand{\\bad}{\\global\\def\\x{a}}\\newcommand{\\recursive}{\\recursive}',{eligibility:'allowlist'});
 assert.deepEqual(policy.classify('\\href{https://example.test/\\notATeXcommand}{Link} \\strong{text}').reasons,[]);
 assert.ok(policy.classify('\\bad').reasons.some(reason=>reason.includes('OutsideState')));
 assert.ok(policy.classify('\\recursive').reasons.some(reason=>reason.includes('RecursiveMacro')));
 assert.ok(new Policy('',{eligibility:'allowlist'}).classify('\\href{url}{Link}').reasons.some(reason=>reason.includes('NeedsPackage')));
 assert.deepEqual(policy.classify('{\\setlength{\\parindent}{0pt} text}').reasons,[]);
});
test('preamble setup follows input read order and never expands a deferred macro input',()=>{
 const files=new Map(Object.entries({'main.tex':{text:'\\documentclass{article}\n\\def\\later{\\input{unused}}\n\\begin{document}\n\\input{one}\n\n\\renewcommand{\\word}{Last}\n\\end{document}'},'one.tex':{text:'\\newcommand{\\word}{First}'},'unused.tex':{text:'\\global\\def\\bad{No}'}}));
 const preamble=effectivePreamble(files,'main.tex');assert.ok(preamble.indexOf('{First}')<preamble.indexOf('{Last}'));assert.doesNotMatch(preamble,/\\bad/);
});

test('recorded index tools are whitelisted and passed as argument arrays',()=>{
 assert.deepEqual(indexCommand('makeindex -s style.ist names.idx','names.idx'),{program:'makeindex',args:['-q','-s','style.ist','names.idx']});
 assert.deepEqual(indexCommand('sh -c arbitrary names.idx','names.idx'),{program:'makeindex',args:['-q','names.idx']});
});

test('balanced macro inference supports bare names, operators and safe environments without trusting deferred declarations',()=>{
 const policy=new Policy(String.raw`\usepackage{amsmath}\usepackage[table]{xcolor}
\newcommand\strong[1]{\textbf{#1}}
\def\word{Hello}
\DeclareMathOperator*{\rank}{rank}
\newcommand{\fake}{\newtheorem{backdoor}{Unsafe}}
\newcommand\defaulted[1][\newtheorem{defaultbackdoor}{Unsafe}]{#1}
\newenvironment{loud}{\bfseries}{ }
\newenvironment{points}{\begin{itemize}}{\end{itemize}}
\newenvironment{unsafe}{\global\def\state{a}}{}
\newcommand{\changed}{safe}\def\changed#1{\global\def\state{#1}}
\NewDocumentCommand\optional{O{\global\def\state{a}}m}{#2}
\newcommand % comment between command and name
\commented[1]% between arguments
{\emph{#1}}`);
 for(const source of [String.raw`\strong{Text} \word \commented{ok}`,String.raw`$\rank A$`,String.raw`\begin{loud}Text\end{loud}`,String.raw`\begin{points}\item One\end{points}`])assert.deepEqual(policy.classify(source).reasons,[],source);
 assert.ok(policy.unitEnvs.has('points'));assert.ok(policy.innerEnvs.has('loud'));assert.ok(!policy.unitEnvs.has('unsafe'));assert.ok(!policy.unitEnvs.has('backdoor'));assert.ok(!policy.unitEnvs.has('defaultbackdoor'));assert.ok(policy.packages.has('colortbl'));
 for(const source of [String.raw`\rank A`,String.raw`\changed{text}`,String.raw`\optional{text}`,String.raw`\defaulted`,String.raw`\begin{unsafe}X\end{unsafe}`])assert.ok(policy.classify(source).reasons.length,source);
 const renewed=new Policy(String.raw`\newenvironment{safe}{}{}\renewenvironment{safe}{\global\def\x{bad}}{}`);assert.ok(renewed.classify(String.raw`\begin{safe}X\end{safe}`).reasons.length);
});

test('TeX environment inherits installation font cache unless an explicit cache is supplied',async t=>{
 const {environment}=await import('../dist/process.js');const cache=fs.realpathSync.native(fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-font-test-')));t.after(()=>fs.rmSync(cache,{recursive:true,force:true}));
 const inherited=process.env.TEXMFCACHE;assert.equal(environment(cache,'main.tex').TEXMFCACHE,inherited);assert.equal(environment(cache,'main.tex',cache).TEXMFCACHE,cache.replaceAll('\\','/'));
});
