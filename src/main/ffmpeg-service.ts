import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface ProbeResult {
  filePath: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
}

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        filePath,
        fileName: path.basename(filePath),
        duration: metadata.format.duration ?? 0,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
      });
    });
  });
}

export interface EDLEntry {
  sourceFile: string;
  inPoint: number;
  outPoint: number;
}

export async function exportTimeline(
  edl: EDLEntry[],
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-edit-'));
  const segments: string[] = [];

  const cleanup = () => {
    segments.forEach(s => { try { fs.unlinkSync(s); } catch { /* ignore */ } });
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  };

  try {
    for (let i = 0; i < edl.length; i++) {
      const entry = edl[i];
      const segPath = path.join(tmpDir, `seg_${i}.mp4`);
      segments.push(segPath);

      await new Promise<void>((res, rej) => {
        ffmpeg(entry.sourceFile)
          .setStartTime(entry.inPoint)
          .setDuration(entry.outPoint - entry.inPoint)
          .outputOptions(['-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast'])
          .output(segPath)
          .on('end', () => res())
          .on('error', (e) => rej(e))
          .run();
      });

      onProgress(((i + 1) / (edl.length + 1)) * 80);
    }

    const concatListPath = path.join(tmpDir, 'concat.txt');
    const concatContent = segments.map(s => `file '${s}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('progress', (progress) => {
          onProgress(80 + (progress.percent ?? 0) * 0.2);
        })
        .on('end', () => {
          try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
          resolve();
        })
        .on('error', (e) => reject(e))
        .run();
    });
  } finally {
    cleanup();
  }
}
