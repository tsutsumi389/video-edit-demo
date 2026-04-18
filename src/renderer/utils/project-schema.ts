import { z } from "zod";
import { PROJECT_FILE_VERSION, type ProjectFile } from "../types/project";

const clipSchema = z.object({
	id: z.string().min(1),
	sourceFile: z.string().min(1),
	fileName: z.string(),
	inPoint: z.number().min(0),
	outPoint: z.number().min(0),
	trackPosition: z.number().min(0),
	duration: z.number().min(0),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const trackSchema = z.object({
	id: z.string().min(1),
	clips: z.array(clipSchema),
});

const projectFileSchema = z.object({
	version: z.literal(PROJECT_FILE_VERSION),
	savedAt: z.string(),
	project: z.object({
		tracks: z.array(trackSchema).min(1),
	}),
});

export function parseProjectFile(raw: unknown): ProjectFile {
	const result = projectFileSchema.safeParse(raw);
	if (!result.success) {
		if (
			typeof raw === "object" &&
			raw !== null &&
			"version" in raw &&
			(raw as { version: unknown }).version !== PROJECT_FILE_VERSION
		) {
			throw new Error(
				`非対応のプロジェクトバージョンです (expected ${PROJECT_FILE_VERSION}, got ${String((raw as { version: unknown }).version)})`,
			);
		}
		throw new Error("プロジェクトファイルの形式が不正です");
	}
	return result.data;
}
