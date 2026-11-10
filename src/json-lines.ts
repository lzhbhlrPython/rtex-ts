/** Incremental UTF-8 framing. Bound a request before allocating/decoding a whole line. */
export async function* jsonLines(input: AsyncIterable<Buffer | string>, maxBytes = 8 * 1024 * 1024): AsyncGenerator<string> {
  let chunks: Buffer[] = [], bytes = 0;
  for await (const value of input) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline;
      const part = chunk.subarray(start, end);
      if (bytes + part.length > maxBytes) throw new Error('Request too large');
      if (part.length) { chunks.push(part); bytes += part.length; }
      if (newline < 0) break;
      yield Buffer.concat(chunks, bytes).toString('utf8').replace(/\r$/, '');
      chunks = []; bytes = 0; start = newline + 1;
    }
  }
  if (bytes) yield Buffer.concat(chunks, bytes).toString('utf8').replace(/\r$/, '');
}
