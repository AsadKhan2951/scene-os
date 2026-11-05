import { zip, type ZipEntry } from './zip';

/**
 * Builds a 16:9 PowerPoint file from simple slides: title, subtitle, body, bullets, one picture
 * and speaker notes. Hand-written Office Open XML (no package can be added right now); checked by
 * opening the output in python-pptx and LibreOffice.
 */

export interface DeckSlide { title: string; subtitle?: string; body?: string; bullets?: string[]; image?: { data: Uint8Array; type: 'jpeg' | 'png' }; notes?: string; cover?: boolean }
export interface DeckTheme { background: string; text: string; muted: string; accent: string; font: string }
export const DEFAULT_DECK_THEME: DeckTheme = { background: '0E0C14', text: 'F4F2FA', muted: 'B8B4C8', accent: '8B6CF7', font: 'Arial' };

const W = 12192000;
const H = 6858000;
const IN = 914400;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 cannot carry.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Width and height of a JPEG or PNG, read from its header. */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  if (data[0] === 0x89 && data[1] === 0x50) return { width: (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19], height: (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23] };
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1];
      const len = (data[i + 2] << 8) | data[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (data[i + 5] << 8) | data[i + 6], width: (data[i + 7] << 8) | data[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

export const imageType = (data: Uint8Array): 'jpeg' | 'png' | null => (data[0] === 0x89 && data[1] === 0x50 ? 'png' : data[0] === 0xff && data[1] === 0xd8 ? 'jpeg' : null);

/** Crop that makes a picture fill a box without stretching (like CSS object-fit: cover), in 1/1000 of a percent. */
function cover(img: { width: number; height: number } | null, boxW: number, boxH: number) {
  if (!img || !img.width || !img.height) return '';
  const imgRatio = img.width / img.height;
  const boxRatio = boxW / boxH;
  if (Math.abs(imgRatio - boxRatio) < 0.01) return '';
  if (imgRatio > boxRatio) { const cut = Math.round(((1 - boxRatio / imgRatio) / 2) * 100000); return `<a:srcRect l="${cut}" r="${cut}"/>`; }
  const cut = Math.round(((1 - imgRatio / boxRatio) / 2) * 100000);
  return `<a:srcRect t="${cut}" b="${cut}"/>`;
}

const run = (text: string, t: DeckTheme, size: number, color: string, bold = false) =>
  `<a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${t.font}"/><a:cs typeface="${t.font}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;

function textBox(id: number, name: string, x: number, y: number, w: number, h: number, paragraphs: string[], anchor: 't' | 'b' | 'ctr' = 't') {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join('')}</p:txBody></p:sp>`;
}

function slideXml(s: DeckSlide, t: DeckTheme, hasImage: boolean) {
  const shapes: string[] = [];
  let id = 2;
  const img = s.image ? imageSize(s.image.data) : null;
  const pic = (x: number, y: number, w: number, h: number) => `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="Picture"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/>${cover(img, w, h)}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const para = (inner: string, pPr = '') => `<a:p>${pPr ? `<a:pPr>${pPr}</a:pPr>` : ''}${inner}</a:p>`;
  const bullets = (s.bullets ?? []).filter(Boolean).map((b) => `<a:p><a:pPr marL="285750" indent="-285750"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:srgbClr val="${t.accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>${run(b, t, 1600, t.text)}</a:p>`);

  if (s.cover) {
    if (hasImage) {
      shapes.push(pic(0, 0, W, H));
      // A dark wash so the title reads over any picture.
      shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Shade"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${t.background}"><a:alpha val="10000"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${t.background}"><a:alpha val="92000"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`);
    }
    shapes.push(textBox(id++, 'Title', 0.8 * IN, 4.1 * IN, W - 1.6 * IN, 1.6 * IN, [para(run(s.title, t, 5400, t.text, true))], 'b'));
    if (s.subtitle || s.body) shapes.push(textBox(id++, 'Subtitle', 0.8 * IN, 5.85 * IN, W - 1.6 * IN, 1.0 * IN, [para(run(s.subtitle || s.body || '', t, 2000, t.muted))]));
  } else {
    const textW = hasImage ? 5.6 * IN : W - 1.6 * IN;
    if (hasImage) shapes.push(pic(Math.round(W * 0.5), 0, Math.round(W * 0.5), H));
    shapes.push(textBox(id++, 'Kicker', 0.8 * IN, 0.7 * IN, textW, 0.4 * IN, [para(run((s.subtitle ?? '').toUpperCase(), t, 1200, t.accent, true))]));
    shapes.push(textBox(id++, 'Title', 0.8 * IN, 1.15 * IN, textW, 1.3 * IN, [para(run(s.title, t, 3600, t.text, true))]));
    const body = [...(s.body ? [para(run(s.body, t, 1600, t.muted), '<a:lnSpc><a:spcPct val="115000"/></a:lnSpc>')] : []), ...bullets];
    if (body.length) shapes.push(textBox(id++, 'Body', 0.8 * IN, 2.6 * IN, textW, H - 3.3 * IN, body));
  }
  return `${XML}<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${t.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesXml(text: string) {
  return `${XML}<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

const THEME = (t: DeckTheme) => `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Scene OS"><a:themeElements><a:clrScheme name="Scene OS"><a:dk1><a:srgbClr val="${t.background}"/></a:dk1><a:lt1><a:srgbClr val="${t.text}"/></a:lt1><a:dk2><a:srgbClr val="1A1724"/></a:dk2><a:lt2><a:srgbClr val="${t.muted}"/></a:lt2><a:accent1><a:srgbClr val="${t.accent}"/></a:accent1><a:accent2><a:srgbClr val="E86AA6"/></a:accent2><a:accent3><a:srgbClr val="4F7CFF"/></a:accent3><a:accent4><a:srgbClr val="2FBF71"/></a:accent4><a:accent5><a:srgbClr val="FF9F43"/></a:accent5><a:accent6><a:srgbClr val="F5D742"/></a:accent6><a:hlink><a:srgbClr val="${t.accent}"/></a:hlink><a:folHlink><a:srgbClr val="${t.muted}"/></a:folHlink></a:clrScheme><a:fontScheme name="Scene OS"><a:majorFont><a:latin typeface="${t.font}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${t.font}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Scene OS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>';
const CLR_MAP = '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

export function buildPptx(slides: DeckSlide[], opts: { title?: string; author?: string; theme?: DeckTheme } = {}): Buffer {
  const t = opts.theme ?? DEFAULT_DECK_THEME;
  const files: ZipEntry[] = [];
  const n = slides.length;
  const hasNotes = slides.some((s) => s.notes);

  files.push({ name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${hasNotes ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' : ''}${slides.map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>${s.notes ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>` : ''}`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` });
  files.push({ name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>` });
  files.push({ name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title ?? 'Pitch deck')}</dc:title><dc:creator>${esc(opts.author ?? 'Scene OS')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` });
  files.push({ name: 'docProps/app.xml', data: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Scene OS</Application><Slides>${n}</Slides></Properties>` });

  files.push({ name: 'ppt/presentation.xml', data: `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>${hasNotes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster"/></p:notesMasterIdLst>' : ''}<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` });
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdTheme" Type="${REL}/theme" Target="theme/theme1.xml"/>${hasNotes ? `<Relationship Id="rIdNotesMaster" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/>` : ''}${slides.map((_, i) => `<Relationship Id="rIdSlide${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>` });

  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${t.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${EMPTY_TREE}</p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>` });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>` });
  files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` });
  files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` });
  files.push({ name: 'ppt/theme/theme1.xml', data: THEME(t) });
  if (hasNotes) {
    files.push({ name: 'ppt/theme/theme2.xml', data: THEME(t) });
    files.push({ name: 'ppt/notesMasters/notesMaster1.xml', data: `${XML}<p:notesMaster ${NS}><p:cSld>${EMPTY_TREE}</p:cSld>${CLR_MAP.replace('bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"', 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"')}</p:notesMaster>` });
    files.push({ name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/theme" Target="../theme/theme2.xml"/></Relationships>` });
  }

  slides.forEach((s, i) => {
    const k = i + 1;
    const hasImage = !!s.image;
    files.push({ name: `ppt/slides/slide${k}.xml`, data: slideXml(s, t, hasImage) });
    const rels = [`<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`];
    if (s.image) {
      const ext = s.image.type === 'png' ? 'png' : 'jpeg';
      files.push({ name: `ppt/media/image${k}.${ext}`, data: s.image.data });
      rels.push(`<Relationship Id="rIdImg" Type="${REL}/image" Target="../media/image${k}.${ext}"/>`);
    }
    if (s.notes) {
      rels.push(`<Relationship Id="rIdNotes" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${k}.xml"/>`);
      files.push({ name: `ppt/notesSlides/notesSlide${k}.xml`, data: notesXml(s.notes) });
      files.push({ name: `ppt/notesSlides/_rels/notesSlide${k}.xml.rels`, data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${k}.xml"/></Relationships>` });
    }
    files.push({ name: `ppt/slides/_rels/slide${k}.xml.rels`, data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` });
  });
  return zip(files);
}

/** Fetches a picture for a slide; a missing or unreadable picture just leaves the slide without one. */
export async function fetchImage(url: string | undefined | null): Promise<DeckSlide['image']> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length > 12 * 1024 * 1024) return undefined;
    const type = imageType(data);
    return type ? { data, type } : undefined;
  } catch {
    return undefined;
  }
}
