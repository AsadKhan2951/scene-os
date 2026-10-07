import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VIDEO = { width: 1280, height: 720, fps: 25 };
const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 8 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${(stderr || err.message).trim().split('\n').slice(-3).join(' ')}`));
      else resolve();
    });
  });
}

/** Re-encodes a clip to the teaser's size and frame rate, trimmed to an exact length, without sound. */
export function normaliseClip(input: string, output: string, seconds: number) {
  const { width, height, fps } = VIDEO;
  return ffmpeg(['-i', input, '-t', String(seconds), '-an',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1`, ...ENCODE, output]);
}

/** A slow push-in on a still image, used when a shot has a picture but no motion clip. */
export function stillClip(image: string, output: string, seconds: number) {
  const { width, height, fps } = VIDEO;
  const frames = Math.ceil(seconds * fps);
  return ffmpeg(['-loop', '1', '-i', image, '-t', String(seconds),
    '-vf', `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps},setsar=1`, ...ENCODE, output]);
}

/** Black closing card with the title and an optional second line. Text is read from files so no escaping is needed. */
export async function endCard(output: string, seconds: number, title: string, line: string | undefined, dir: string, font: string) {
  const { width, height, fps } = VIDEO;
  const titleFile = path.join(dir, 'title.txt');
  await writeFile(titleFile, title);
  const fade = `fade=t=in:st=0:d=0.6`;
  let draw = `drawtext=fontfile=${font}:textfile=${titleFile}:fontcolor=white:fontsize=${Math.max(30, Math.min(64, Math.floor(1900 / Math.max(1, title.length))))}:x=(w-text_w)/2:y=(h-text_h)/2-${line ? 30 : 0}`;
  if (line) {
    const lineFile = path.join(dir, 'line.txt');
    await writeFile(lineFile, line);
    draw += `,drawtext=fontfile=${font}:textfile=${lineFile}:fontcolor=0xC6C4DA:fontsize=30:x=(w-text_w)/2:y=(h/2)+40`;
  }
  return ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${seconds}`, '-vf', `${draw},${fade},setsar=1`, ...ENCODE, output]);
}

/** A plain black card, used if the text card cannot be drawn on this machine. */
export function blankCard(output: string, seconds: number) {
  const { width, height, fps } = VIDEO;
  return ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${seconds}`, '-vf', 'setsar=1', ...ENCODE, output]);
}

/** Joins clips that were all produced by the functions above (same size, rate and codec). */
export async function concat(clips: string[], output: string, dir: string) {
  const list = path.join(dir, 'list.txt');
  await writeFile(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
  return ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output]);
}

/**
 * Lays the voice-over and music under the picture. Music sits low under a voice-over,
 * fuller without one, and fades out at the end. With no audio the picture is copied as is.
 */
export function addAudio(video: string, output: string, seconds: number, audio: { voiceOver?: string; music?: string }) {
  const inputs = ['-i', video];
  const parts: string[] = [];
  const mix: string[] = [];
  let index = 1;
  if (audio.voiceOver) {
    inputs.push('-i', audio.voiceOver);
    parts.push(`[${index}:a]adelay=800|800,apad[vo]`);
    mix.push('[vo]');
    index++;
  }
  if (audio.music) {
    inputs.push('-stream_loop', '-1', '-i', audio.music);
    parts.push(`[${index}:a]volume=${audio.voiceOver ? 0.22 : 0.7},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, seconds - 2.5)}:d=2.5[mu]`);
    mix.push('[mu]');
  }
  if (!mix.length) return ffmpeg(['-i', video, '-c', 'copy', '-movflags', '+faststart', output]);
  const filter = `${parts.join(';')};${mix.join('')}amix=inputs=${mix.length}:duration=longest:normalize=0,atrim=0:${seconds}[a]`;
  return ffmpeg([...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(seconds), '-movflags', '+faststart', output]);
}
