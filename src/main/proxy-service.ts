import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { log } from "./logger";
import { getCachedPreferences } from "./preferences";

if (ffmpegPath) {
	ffmpeg.setFfmpegPath(ffmpegPath);
}

function proxyDir(): string {
	return path.join(app.getPath("userData"), "proxies");
}

function hashPath(filePath: string): string {
	return crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 16);
}

function proxyPathFor(filePath: string, maxHeight: number): string {
	return path.join(proxyDir(), `${hashPath(filePath)}_${maxHeight}.mp4`);
}

const inflight = new Map<string, Promise<string | null>>();

export async function getExistingProxy(filePath: string): Promise<string | null> {
	const prefs = getCachedPreferences();
	if (!prefs.proxyEnabled) return null;
	const target = proxyPathFor(filePath, prefs.proxyMaxHeight);
	try {
		await fsp.access(target);
		return target;
	} catch {
		return null;
	}
}

export async function ensureProxy(filePath: string): Promise<string | null> {
	const prefs = getCachedPreferences();
	if (!prefs.proxyEnabled) return null;
	const target = proxyPathFor(filePath, prefs.proxyMaxHeight);
	try {
		await fsp.access(target);
		return target;
	} catch {}
	const pending = inflight.get(target);
	if (pending) return pending;
	const job = (async () => {
		await fsp.mkdir(proxyDir(), { recursive: true });
		const tmp = `${target}.tmp`;
		try {
			await new Promise<void>((resolve, reject) => {
				ffmpeg(filePath)
					.outputOptions([
						"-vf",
						`scale='min(iw,-2)':'min(${prefs.proxyMaxHeight},ih)':force_original_aspect_ratio=decrease`,
						"-c:v",
						"libx264",
						"-preset",
						"veryfast",
						"-crf",
						"28",
						"-c:a",
						"aac",
						"-b:a",
						"128k",
						"-movflags",
						"+faststart",
					])
					.output(tmp)
					.on("end", () => resolve())
					.on("error", (err) => reject(err))
					.run();
			});
			await fsp.rename(tmp, target);
			log("info", "proxy", "プロキシを生成しました", target);
			return target;
		} catch (err) {
			await fsp.unlink(tmp).catch(() => undefined);
			log("warn", "proxy", "プロキシ生成に失敗しました", (err as Error).message);
			return null;
		} finally {
			inflight.delete(target);
		}
	})();
	inflight.set(target, job);
	return job;
}

export async function clearProxies(): Promise<void> {
	try {
		await fsp.rm(proxyDir(), { recursive: true, force: true });
		log("info", "proxy", "プロキシをすべて削除しました");
	} catch {}
}
