/** Optional Poppler raster oracle. This compares rendered pixels, not PDF structure or glyph IDs. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { Processes } from './process.js';
export interface PdfCompareOptions { dpi?: number; tolerance?: number; maxDifferentRatio?: number; pdfinfo?: string; pdftoppm?: string; timeoutMs?: number }
export interface PdfComparison { equal: boolean; scope: 'raster'; dpi: number; tolerance: number; maxDifferentRatio: number; pagesA: number; pagesB: number; pages: Array<{ page: number; widthA: number; heightA: number; widthB: number; heightB: number; differentPixels: number; totalPixels: number; ratio: number; maxChannelDelta: number; equal: boolean }> }
const MAX_PIXELS = 20_000_000, MAX_FILE = 64 * 1024 * 1024;
/** Poppler P6 output: comments/whitespace in header, exactly one delimiter before binary pixels. */
export function ppmImage(data: Buffer): { width: number; height: number; pixels: Buffer } {
  let at = 0;
  const word = () => {
    for (;;) { while (at < data.length && /\s/.test(String.fromCharCode(data[at]))) at++; if (data[at] !== 35) break; while (at < data.length && data[at] !== 10) at++; }
    const start = at; while (at < data.length && !/\s/.test(String.fromCharCode(data[at]))) at++;
    return data.toString('ascii', start, at);
  };
  if (word() !== 'P6') throw new Error('Expected binary RGB PPM');
  const width = Number(word()), height = Number(word()), max = word();
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS || max !== '255') throw new Error('Invalid or excessive raster dimensions');
  if (data[at] === 13 && data[at + 1] === 10) at += 2; else if (at < data.length && /\s/.test(String.fromCharCode(data[at]))) at++; else throw new Error('Invalid PPM delimiter');
  const pixels = data.subarray(at); if (pixels.length !== width * height * 3) throw new Error('Invalid PPM pixel length');
  return { width, height, pixels };
}
export async function comparePdfs(a: string, b: string, options: PdfCompareOptions = {}): Promise<PdfComparison> {
  const dpi = options.dpi ?? 96, tolerance = options.tolerance ?? 0, ratioLimit = options.maxDifferentRatio ?? 0, timeout = options.timeoutMs ?? 30000;
  if (!Number.isInteger(dpi) || dpi < 36 || dpi > 300 || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255 || !Number.isFinite(ratioLimit) || ratioLimit < 0 || ratioLimit > 1 || !Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Invalid PDF comparison limits');
  const inputs = await Promise.all([a,b].map(async file => { const resolved = await fs.realpath(file), stat = await fs.stat(resolved); if (!stat.isFile() || stat.size > MAX_FILE) throw new Error('PDF must be a regular file of at most 64 MiB'); return resolved; }));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rtex-pdf-compare-')), processes = new Processes();
  const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };
  const run = async (executable: string, args: string[]) => {
    const result = await processes.run(executable, args, dir, env, timeout);
    if (result.code !== 0) throw new Error('PDF oracle failed: ' + result.log.slice(-2000)); return result.log;
  };
  try {
    // Freeze bounded inputs before metadata inspection and rendering; caller writes cannot change dimensions between tools.
    const files: string[] = [];
    for (let index = 0; index < inputs.length; index++) {
      const handle = await fs.open(inputs[index], 'r');
      try {
        const stat = await handle.stat(); if (!stat.isFile() || stat.size > MAX_FILE) throw new Error('PDF must be a regular file of at most 64 MiB');
        const data = Buffer.alloc(stat.size + 1); let length = 0;
        while (length < data.length) { const read = await handle.read(data, length, data.length - length, null); if (!read.bytesRead) break; length += read.bytesRead; }
        if (length !== stat.size) throw new Error('PDF changed while taking a snapshot');
        const target = path.join(dir, 'input-' + index + '.pdf'); await fs.writeFile(target, data.subarray(0, length)); files.push(target);
      } finally { await handle.close(); }
    }
    const counts: number[] = [];
    for (const file of files) {
      const info = await run(options.pdfinfo || 'pdfinfo', ['-f', '1', '-l', '100', '-box', file]);
      const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
      if (!Number.isSafeInteger(pages) || pages < 1 || pages > 100) throw new Error('Invalid or excessive PDF page count');
      const sizes = [...info.matchAll(/^(?:Page\s+\d+\s+size:|Page size:)\s+([\d.]+) x ([\d.]+) pts/gm)];
      if (sizes.length !== pages || sizes.some(size => { const width = Math.ceil(Number(size[1]) * dpi / 72), height = Math.ceil(Number(size[2]) * dpi / 72); return !width || !height || width * height > MAX_PIXELS; })) throw new Error('Invalid or excessive PDF page dimensions');
      const boxes = [...info.matchAll(/^Page(?:\s+\d+)?\s+MediaBox:\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/gm)];
      if (boxes.length !== pages || boxes.some(box => { const width = Math.ceil(Math.abs(Number(box[3]) - Number(box[1])) * dpi / 72), height = Math.ceil(Math.abs(Number(box[4]) - Number(box[2])) * dpi / 72); return !Number.isFinite(width * height) || !width || !height || width * height > MAX_PIXELS; })) throw new Error('Invalid or excessive PDF media dimensions');
      counts.push(pages);
    }
    const result: PdfComparison = { equal: counts[0] === counts[1], scope: 'raster', dpi, tolerance, maxDifferentRatio: ratioLimit, pagesA: counts[0], pagesB: counts[1], pages: [] };
    let total = 0;
    for (let page = 1; page <= Math.min(...counts); page++) {
      const images = [];
      for (let index = 0; index < 2; index++) {
        const prefix = path.join(dir, 'page-' + index);
        await run(options.pdftoppm || 'pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(dpi), files[index], prefix]);
        const file = prefix + '.ppm', stat = await fs.stat(file);
        if (stat.size > MAX_FILE) throw new Error('Raster output exceeds 64 MiB');
        images.push(ppmImage(await fs.readFile(file))); await fs.unlink(file);
      }
      const [left, right] = images; total += Math.max(left.width * left.height, right.width * right.height);
      if (total > 200_000_000) throw new Error('Total raster pixel limit exceeded');
      const sameSize = left.width === right.width && left.height === right.height;
      const totalPixels = Math.max(left.width * left.height, right.width * right.height); let differentPixels = sameSize ? 0 : totalPixels, maxChannelDelta = sameSize ? 0 : 255;
      if (sameSize) for (let i = 0; i < left.pixels.length; i += 3) {
        const delta = Math.max(Math.abs(left.pixels[i] - right.pixels[i]), Math.abs(left.pixels[i + 1] - right.pixels[i + 1]), Math.abs(left.pixels[i + 2] - right.pixels[i + 2]));
        if (i && i % 786432 === 0) await setImmediate();
        if (delta > tolerance) differentPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      const ratio = differentPixels / totalPixels, equal = sameSize && ratio <= ratioLimit;
      result.pages.push({ page, widthA: left.width, heightA: left.height, widthB: right.width, heightB: right.height, differentPixels, totalPixels, ratio, maxChannelDelta, equal }); result.equal &&= equal;
    }
    return result;
  } finally { processes.close(); await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
