import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
	time: string;
	level: LogLevel;
	source: string;
	message: string;
	detail?: string;
}

const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];

function logFilePath(): string {
	return path.join(app.getPath("userData"), "app.log");
}

export function log(level: LogLevel, source: string, message: string, detail?: string): void {
	const entry: LogEntry = {
		time: new Date().toISOString(),
		level,
		source,
		message,
		detail,
	};
	entries.push(entry);
	if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

	const line = `[${entry.time}] ${level.toUpperCase()} ${source}: ${message}${detail ? ` | ${detail}` : ""}\n`;
	fs.mkdir(path.dirname(logFilePath()), { recursive: true })
		.then(() => fs.appendFile(logFilePath(), line, "utf-8"))
		.catch(() => {
			/* disk log best-effort */
		});
}

export function getRecentLogs(): LogEntry[] {
	return [...entries];
}

export interface Diagnostics {
	capturedAt: string;
	app: {
		name: string;
		version: string;
		electron: string;
		chrome: string;
		node: string;
	};
	system: {
		platform: NodeJS.Platform;
		arch: string;
		locale: string;
	};
	logs: LogEntry[];
}

export function buildDiagnostics(): Diagnostics {
	return {
		capturedAt: new Date().toISOString(),
		app: {
			name: app.getName(),
			version: app.getVersion(),
			electron: process.versions.electron ?? "",
			chrome: process.versions.chrome ?? "",
			node: process.versions.node ?? "",
		},
		system: {
			platform: process.platform,
			arch: process.arch,
			locale: app.getLocale(),
		},
		logs: getRecentLogs(),
	};
}
