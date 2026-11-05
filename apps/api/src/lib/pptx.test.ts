import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';
import { buildPptx, imageSize, imageType } from './pptx';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a valid archive layout', () => {
    const z = zip([{ name: 'a.txt', data: 'hello' }, { name: 'b/c.txt', data: 'world' }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    expect(z.readUInt32LE(z.length - 22)).toBe(0x06054b50);
    expect(z.readUInt16LE(z.length - 12)).toBe(2);
  });
});

describe('pptx', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0x20, 0, 0, 2, 0x58]);
  it('reads picture sizes', () => {
    expect(imageType(png)).toBe('png');
    expect(imageSize(png)).toEqual({ width: 800, height: 600 });
  });
  it('builds a deck with every slide, picture and note', () => {
    const file = buildPptx([
      { title: 'Title & <more>', cover: true, image: { data: png, type: 'png' }, notes: 'Say hello' },
      { title: 'Second', bullets: ['One', 'Two'] },
    ]);
    const text = file.toString('latin1');
    for (const part of ['ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/media/image1.png', 'ppt/notesSlides/notesSlide1.xml', 'ppt/theme/theme1.xml']) expect(text).toContain(part);
    expect(text).toContain('Title &amp; &lt;more&gt;');
  });
});
