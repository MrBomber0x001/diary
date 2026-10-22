import { Fragment } from 'react';

function inline(text) {
  const nodes = [];
  const pattern = /(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const content = token.slice(1, -1);
    if (token.startsWith('![')) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      let safeUrl = null;
      try {
        const parsed = new URL(image[2], window.location.origin);
        if (parsed.protocol === 'https:' || parsed.origin === window.location.origin) safeUrl = parsed.href;
      } catch { /* Invalid image URLs remain plain text. */ }
      nodes.push(safeUrl ? <img className="markdown-image" key={match.index} src={safeUrl} alt={image[1]} loading="lazy" /> : token);
    } else if (token.startsWith('**') || token.startsWith('__')) nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('~~')) nodes.push(<del key={match.index}>{content}</del>);
    else if (token.startsWith('`')) nodes.push(<code key={match.index}>{content}</code>);
    else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      let safeUrl = null;
      try {
        const parsed = new URL(link[2], window.location.origin);
        if (['http:', 'https:'].includes(parsed.protocol)) safeUrl = parsed.href;
      } catch { /* Invalid links stay plain text. */ }
      nodes.push(safeUrl ? <a key={match.index} href={safeUrl} target="_blank" rel="noreferrer">{link[1]}</a> : token);
    } else nodes.push(<em key={match.index}>{content}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

export default function MarkdownContent({ children, className = '' }) {
  const lines = String(children || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}`;
      blocks.push(<Tag key={index}>{inline(heading[2])}</Tag>);
      index += 1;
    } else if (/^```/.test(line)) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>);
    } else if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`}>{inline(quote.join(' '))}</blockquote>);
    } else if (/^\s*[-*+]\s+/.test(line)) {
      const list = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) list.push(lines[index++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(<ul key={`ul-${index}`}>{list.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const list = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) list.push(lines[index++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={`ol-${index}`}>{list.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ol>);
    } else {
      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim()
        && !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s+|\s*\d+\.\s+)/.test(lines[index])) paragraph.push(lines[index++]);
      blocks.push(<p key={`p-${index}`}>{inline(paragraph.join(' '))}</p>);
    }
  }
  return <div className={`markdown-content ${className}`} dir="auto">{blocks}</div>;
}
