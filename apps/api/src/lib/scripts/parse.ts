import { inflateRawSync } from 'node:zlib';

/**
 * Screenplay import. Final Draft (.fdx) and Fountain are parsed exactly with code; .docx and
 * .txt are read as text and parsed like Fountain. PDF (and InPage, exported to PDF) are read
 * by Claude in the intake run, then parsed here from the text it returns.
 *
 * Every format ends as the same thing: numbered scenes with their elements, and the plain
 * screenplay text the rest of Scene OS already reads ("1. INT. PLACE - TIME" headings).
 */

export type ScriptFormat = 'fdx' | 'fountain' | 'txt' | 'docx' | 'pdf';
export type ElementType = 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition';
export interface ScriptElement { type: ElementType; text: string }
export interface ParsedScene {
  number: number;
  heading: string;
  intExt: 'INT' | 'EXT' | 'INT/EXT' | '';
  location: string;
  time: string;
  /** Page length in eighths when the file says it (Final Draft); otherwise estimated. */
  eighths: number;
  elements: ScriptElement[];
}
export interface ParsedScript { title?: string; scenes: ParsedScene[] }

export interface CharacterCount { name: string; scenes: number; lines: number; firstScene: number; sceneNumbers: number[] }
export interface ScriptStats { scenes: number; characters: number; mainCharacters: number; locations: number; pages: number; runtimeMinutes: number }

export function formatOf(fileName: string): ScriptFormat | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'fdx') return 'fdx';
  if (ext === 'fountain' || ext === 'spmd') return 'fountain';
  if (ext === 'txt' || ext === 'text') return 'txt';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  return null;
}

// ---- Scene headings ----
const HEADING = /^(?:\d+[A-Z]?\.?\s+)?(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.+?)(?:\s+\d+[A-Z]?)?$/i;

export function splitHeading(raw: string): Pick<ParsedScene, 'heading' | 'intExt' | 'location' | 'time'> {
  const heading = raw.replace(/\s+/g, ' ').trim().replace(/^\./, '');
  const m = heading.match(HEADING);
  if (!m) return { heading: heading.toUpperCase(), intExt: '', location: heading, time: '' };
  const kind = m[1].toUpperCase().replace(/\./g, '');
  const intExt = kind.includes('/') || kind === 'I/E' ? 'INT/EXT' : kind.startsWith('INT') ? 'INT' : 'EXT';
  const rest = m[2].trim();
  const dash = rest.split(/\s+[-–—]\s+/);
  const time = dash.length > 1 ? dash.pop()!.trim() : '';
  return { heading: `${intExt === 'INT/EXT' ? 'INT./EXT.' : `${intExt}.`} ${rest}`.toUpperCase(), intExt, location: dash.join(' - ').trim().toUpperCase(), time: time.toUpperCase() };
}

export const isHeading = (line: string) => /^\.[^.]/.test(line.trim()) || HEADING.test(line.trim()) && /^(?:\d+[A-Z]?\.?\s+)?(INT|EXT|EST|I\/E)/i.test(line.trim());

// ---- Final Draft (.fdx) ----
const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/** "1 4/8" → 12 eighths. */
export function eighthsOf(length: string | undefined): number {
  if (!length) return 0;
  const m = length.trim().match(/^(\d+)?\s*(?:(\d+)\/8)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 8 + Number(m[2] ?? 0);
}

const FDX_TYPES: Record<string, ElementType | 'heading'> = {
  'Scene Heading': 'heading', Action: 'action', Character: 'character', Dialogue: 'dialogue',
  Parenthetical: 'parenthetical', Transition: 'transition', Shot: 'action', General: 'action',
};

export function parseFdx(xml: string): ParsedScript {
  const scenes: ParsedScene[] = [];
  const title = xml.match(/<TitlePage>[\s\S]*?<Text[^>]*>([^<]+)<\/Text>/)?.[1];
  const paragraphs = xml.matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/g);
  for (const [, attrs, body] of paragraphs) {
    const type = FDX_TYPES[attrs.match(/Type="([^"]+)"/)?.[1] ?? 'Action'] ?? 'action';
    const text = decode([...body.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1]).join('')).trim();
    if (type === 'heading') {
      if (!text) continue;
      const length = body.match(/<SceneProperties\b[^>]*Length="([^"]+)"/)?.[1];
      const number = Number(attrs.match(/Number="(\d+)/)?.[1]) || scenes.length + 1;
      scenes.push({ number, ...splitHeading(text), eighths: eighthsOf(length), elements: [] });
      continue;
    }
    if (!text || !scenes.length) continue;
    scenes[scenes.length - 1].elements.push({ type, text });
  }
  return { title: title ? decode(title).trim() : undefined, scenes: renumber(scenes) };
}

// ---- Fountain and plain text ----
/** Fountain (https://fountain.io), lenient enough for screenplays typed in Word or a text editor. */
export function parseFountain(source: string): ParsedScript {
  let text = source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
  let title: string | undefined;
  const titlePage = text.match(/^(?:[A-Za-z ]+:.*\n)+\n/);
  if (titlePage && /^title:/im.test(titlePage[0])) {
    title = titlePage[0].match(/^title:\s*(.+)$/im)?.[1].trim();
    text = text.slice(titlePage[0].length);
  }
  const lines = text.split('\n');
  const scenes: ParsedScene[] = [];
  let inDialogue = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { inDialogue = false; continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    if (prevBlank && isHeading(line)) {
      scenes.push({ number: scenes.length + 1, ...splitHeading(line), eighths: 0, elements: [] });
      inDialogue = false;
      continue;
    }
    if (!scenes.length) continue;
    const els = scenes[scenes.length - 1].elements;
    const nextFilled = i + 1 < lines.length && lines[i + 1].trim() !== '';
    if (inDialogue) {
      els.push({ type: /^\(.*\)$/.test(line) ? 'parenthetical' : 'dialogue', text: line });
      continue;
    }
    if (/^>.*[^<]$/.test(line) || (/^[A-Z .'-]+TO:$/.test(line) && prevBlank)) { els.push({ type: 'transition', text: line.replace(/^>\s*/, '') }); continue; }
    // A character cue: a short line in capitals (or forced with @) with dialogue right under it.
    const cue = line.startsWith('@') ? line.slice(1) : line;
    if (prevBlank && nextFilled && (line.startsWith('@') || (cue === cue.toUpperCase() && /\p{Lu}/u.test(cue) && cue.length <= 50 && !/[.!?]$/.test(cue.replace(/\(.*\)/, '').trim())))) {
      els.push({ type: 'character', text: cue.replace(/\s*\^$/, '') });
      inDialogue = true;
      continue;
    }
    els.push({ type: 'action', text: line.replace(/^!/, '') });
  }
  return { title, scenes: renumber(scenes) };
}

// ---- Word (.docx): a zip with the text in word/document.xml ----
/** Reads one file out of a zip using the central directory (no zip library needed). */
export function unzipEntry(zip: Buffer, name: string): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= zip.length; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entryName = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (entryName === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function docxText(file: Buffer): string {
  const xml = unzipEntry(file, 'word/document.xml');
  if (!xml) throw new Error('This .docx could not be opened. Save it again from Word, or export it as PDF');
  return [...xml.toString('utf8').matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(([p]) => decode([...p.matchAll(/<w:(t|tab)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)/g)].map((m) => (m[1] === 'tab' ? '\t' : m[2] ?? '')).join('')))
    .join('\n');
}

// ---- Shared ----
function renumber(scenes: ParsedScene[]): ParsedScene[] {
  // Keep the file's own numbers when they run in order; otherwise number 1, 2, 3.
  const ordered = scenes.every((s, i) => i === 0 || s.number > scenes[i - 1].number);
  return ordered ? scenes : scenes.map((s, i) => ({ ...s, number: i + 1 }));
}

/** A character cue without extensions: "IDRIS (V.O.)" and "IDRIS (CONT'D)" are both IDRIS. */
export const cueName = (cue: string) => cue.replace(/\(.*?\)/g, '').replace(/\^/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/** About 55 lines of screenplay make a page; used when the file gives no page lengths. */
function estimateEighths(scene: ParsedScene): number {
  const lines = 2 + scene.elements.reduce((n, e) => n + Math.max(1, Math.ceil(e.text.length / (e.type === 'dialogue' ? 35 : 60))) + (e.type === 'character' ? 1 : 0), 0);
  return Math.max(1, Math.round((lines / 55) * 8));
}

export function withLengths(script: ParsedScript): ParsedScript {
  return { ...script, scenes: script.scenes.map((s) => (s.eighths > 0 ? s : { ...s, eighths: estimateEighths(s) })) };
}

export function countCharacters(script: ParsedScript): CharacterCount[] {
  const map = new Map<string, CharacterCount>();
  for (const scene of script.scenes) {
    for (const el of scene.elements) {
      if (el.type !== 'character') continue;
      const name = cueName(el.text);
      if (!name) continue;
      const c = map.get(name) ?? { name, scenes: 0, lines: 0, firstScene: scene.number, sceneNumbers: [] };
      c.lines++;
      if (!c.sceneNumbers.includes(scene.number)) { c.sceneNumbers.push(scene.number); c.scenes++; }
      map.set(name, c);
    }
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines);
}

export function scriptStats(script: ParsedScript, chars = countCharacters(script)): ScriptStats {
  const eighths = script.scenes.reduce((n, s) => n + s.eighths, 0);
  const pages = script.scenes.length ? Math.max(1, Math.round(eighths / 8)) : 0;
  return {
    scenes: script.scenes.length,
    characters: chars.length,
    mainCharacters: chars.filter((c) => c.lines >= Math.max(3, (chars[0]?.lines ?? 0) * 0.25)).length,
    locations: new Set(script.scenes.map((s) => s.location.toUpperCase())).size,
    pages,
    runtimeMinutes: pages,
  };
}

/** The plain screenplay text the rest of Scene OS reads: "1. INT. PLACE - TIME" then the scene. */
export function toPlainText(script: ParsedScript): string {
  return script.scenes.map((s) => {
    const body = s.elements.map((e) => (e.type === 'character' ? `\n${e.text.toUpperCase()}` : e.type === 'transition' ? `\n${e.text.toUpperCase()}` : e.type === 'action' ? `\n${e.text}` : e.text)).join('\n');
    return `${s.number}. ${s.heading}\n${body}`.trim();
  }).join('\n\n');
}

/** Reads any supported file that does not need AI. PDF returns null: Claude reads it in the run. */
export function parseFile(format: ScriptFormat, file: Buffer): ParsedScript | null {
  if (format === 'fdx') return withLengths(parseFdx(file.toString('utf8')));
  if (format === 'fountain' || format === 'txt') return withLengths(parseFountain(file.toString('utf8')));
  if (format === 'docx') return withLengths(parseFountain(docxText(file)));
  return null;
}
