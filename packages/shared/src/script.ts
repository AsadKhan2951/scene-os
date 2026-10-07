/**
 * Removes the markdown an AI model tends to add (headings, bold, italics, rules),
 * so scripts and answers are stored and shown as plain text.
 */
export function plainText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*([-*_]\s*){3,}$/.test(line))
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^(\s*)\*(?!\s)(.+?)\*\s*$/, '$1$2').replace(/(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface SceneMark { number: number; heading: string; at: number }

/** Finds numbered INT./EXT. scene headings, tolerating markdown around them. */
export function sceneMarks(content: string): SceneMark[] {
  return [...content.matchAll(/^[ \t>#*_]*(\d+)\.[ \t*_]*((?:INT|EXT)[.\s][^\n]*)/gim)].map((m) => ({
    number: Number(m[1]),
    heading: m[2].replace(/[*_]+\s*$/, '').trim(),
    at: m.index ?? 0,
  }));
}

/** The text of one numbered scene, or the opening of the text when it has no headings yet. */
export function sceneText(content: string, sceneNumber: number): string {
  const marks = sceneMarks(content);
  if (!marks.length) return content.slice(0, 6000);
  const i = marks.findIndex((m) => m.number === sceneNumber);
  if (i === -1) return '';
  return content.slice(marks[i].at, marks[i + 1]?.at ?? content.length).trim();
}

/** Pulls the first JSON array out of a model reply that may have prose or a code fence around it. */
export function extractJsonArray(raw: string): unknown {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('The reply contained no JSON array');
  return JSON.parse(raw.slice(start, end + 1));
}
