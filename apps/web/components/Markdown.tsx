import React from 'react';

/**
 * Tiny, dependency-free markdown renderer — enough for the docs set: headings,
 * paragraphs, unordered lists, blockquotes, fenced code, GFM tables, inline
 * code / bold / italic / links. Not a full CommonMark implementation; the docs
 * are written to stay within this subset.
 *
 * (Swap for `react-markdown` + `remark-gfm` once deps are installed if richer
 * markdown is needed — TODO.)
 */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first (so ** inside code isn't parsed), then links, bold, italic.
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('`')) {
      nodes.push(
        <code key={key} className="data rounded bg-black/60 px-1.5 py-0.5 text-[0.85em] text-lime">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (lm)
        nodes.push(
          <a key={key} href={lm[2]} className="text-lime underline underline-offset-2">
            {lm[1]}
          </a>,
        );
    } else if (tok.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-paper">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code.
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={k++}
          className="data overflow-x-auto rounded-xl border border-line bg-black/60 p-4 text-xs leading-relaxed"
        >
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Headings.
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], `h${k}`);
      const cls =
        level === 1
          ? 'headline mt-2 text-3xl'
          : level === 2
            ? 'headline text-lg mt-8'
            : 'headline text-[15px] mt-6';
      blocks.push(
        React.createElement(`h${Math.min(level, 4)}`, { key: k++, className: cls }, content),
      );
      i++;
      continue;
    }

    // Blockquote.
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k++} className="my-4 border-l-2 border-lime/50 pl-4 text-sm text-mute">
          {inline(buf.join(' '), `bq${k}`)}
        </blockquote>,
      );
      continue;
    }

    // GFM table.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[-:\s|]+\|/.test(lines[i + 1])) {
      const header = line.split('|').map((s) => s.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map((s) => s.trim()).filter(Boolean));
        i++;
      }
      blocks.push(
        <div key={k++} className="my-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                {header.map((h2, hi) => (
                  <th key={hi} className="px-4 py-2 font-medium">
                    {h2}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line/60 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="data px-4 py-2 text-mute">
                      {inline(c, `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={k++} className="my-3 list-disc space-y-1 pl-5 text-sm text-mute">
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `li${k}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (gather until blank).
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|>|```|\s*[-*]\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={k++} className="my-3 text-sm leading-relaxed text-paper/90">
        {inline(buf.join(' '), `p${k}`)}
      </p>,
    );
  }

  return <div className="max-w-3xl">{blocks}</div>;
}
