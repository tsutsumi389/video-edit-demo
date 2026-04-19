import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { loadPreferences } from "./preferences";

export interface RecentFile {
	filePath: string;
	openedAt: string;
}

function recentPath(): string {
	return path.join(app.getPath("userData"), "recent-files.json");
}

async function readList(): Promise<RecentFile[]> {
	try {
		const content = await fs.readFile(recentPath(), "utf-8");
		const parsed = JSON.parse(content);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const r = item as Partial<RecentFile>;
			if (typeof r.filePath !== "string") return [];
			return [{ filePath: r.filePath, openedAt: r.openedAt ?? new Date().toISOString() }];
		});
	} catch {
		return [];
	}
}

async function writeList(list: RecentFile[]): Promise<void> {
	await fs.mkdir(path.dirname(recentPath()), { recursive: true });
	await fs.writeFile(recentPath(), JSON.stringify(list, null, 2), "utf-8");
}

export async function listRecentFiles(): Promise<RecentFile[]> {
	const list = await readList();
	const checked = await Promise.all(
		list.map((item) =>
			fs
				.access(item.filePath)
				.then(() => item)
				.catch(() => null),
		),
	);
	const existing = checked.filter((item): item is RecentFile => item !== null);
	if (existing.length !== list.length) {
		await writeList(existing);
	}
	return existing;
}

export async function addRecentFile(filePath: string): Promise<RecentFile[]> {
	const prefs = await loadPreferences();
	const current = await readList();
	const without = current.filter((r) => r.filePath !== filePath);
	const next = [{ filePath, openedAt: new Date().toISOString() }, ...without].slice(
		0,
		prefs.recentFilesLimit,
	);
	await writeList(next);
	return next;
}

export async function clearRecentFiles(): Promise<void> {
	await writeList([]);
}
