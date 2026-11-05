import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { countCharacters, docxText, eighthsOf, parseFdx, parseFountain, scriptStats, splitHeading, toPlainText } from './parse';

const FDX = `<FinalDraft><Content>
<Paragraph Number="1" Type="Scene Heading"><SceneProperties Length="1 4/8"/><Text>EXT. GWADAR HARBOUR - NIGHT</Text></Paragraph>
<Paragraph Type="Action"><Text>Rain. IDRIS hauls salt.</Text></Paragraph>
<Paragraph Type="Character"><Text>IDRIS</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Not tonight &amp; not ever.</Text></Paragraph>
<Paragraph Number="2" Type="Scene Heading"><Text>INT. FERRY - NIGHT</Text></Paragraph>
<Paragraph Type="Character"><Text>IDRIS (CONT'D)</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Hold on.</Text></Paragraph>
</Content></FinalDraft>`;

const FOUNTAIN = `Title: The Salt Road

EXT. GWADAR HARBOUR - NIGHT

Rain lashes the dock.

IDRIS
Not tonight.

LEYLA
(whispering)
Please.

INT. FERRY HOLD - DAWN

Leyla hides.`;

/** A minimal one-file zip, enough to test the .docx reader. */
function zip(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content));
  const n = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const cdStart = local.length + n.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, n, data, central, n, end]);
}

describe('screenplay import', () => {
  it('splits a scene heading', () => {
    expect(splitHeading('ext. gwadar harbour - night')).toMatchObject({ intExt: 'EXT', location: 'GWADAR HARBOUR', time: 'NIGHT' });
    expect(splitHeading('INT./EXT. CAR - DAY')).toMatchObject({ intExt: 'INT/EXT', location: 'CAR' });
  });
  it('reads eighths', () => { expect(eighthsOf('1 4/8')).toBe(12); expect(eighthsOf('2/8')).toBe(2); });

  it('parses Final Draft with lengths, cues and entities', () => {
    const s = parseFdx(FDX);
    expect(s.scenes).toHaveLength(2);
    expect(s.scenes[0].eighths).toBe(12);
    expect(s.scenes[0].elements[2]).toEqual({ type: 'dialogue', text: 'Not tonight & not ever.' });
    expect(countCharacters(s)[0]).toMatchObject({ name: 'IDRIS', scenes: 2, lines: 2, firstScene: 1 });
  });

  it('parses Fountain with a title page, dialogue and parentheticals', () => {
    const s = parseFountain(FOUNTAIN);
    expect(s.title).toBe('The Salt Road');
    expect(s.scenes.map((x) => x.heading)).toEqual(['EXT. GWADAR HARBOUR - NIGHT', 'INT. FERRY HOLD - DAWN']);
    expect(s.scenes[0].elements.map((e) => e.type)).toEqual(['action', 'character', 'dialogue', 'character', 'parenthetical', 'dialogue']);
    expect(toPlainText(s)).toMatch(/^1\. EXT\. GWADAR HARBOUR - NIGHT/);
    expect(scriptStats(s).scenes).toBe(2);
  });

  it('reads the text of a .docx', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>INT. HAVELI - DAY</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Ammi &amp; Beta</w:t></w:r></w:p></w:body></w:document>';
    expect(docxText(zip('word/document.xml', xml))).toBe('INT. HAVELI - DAY\nAmmi & Beta');
  });
});
