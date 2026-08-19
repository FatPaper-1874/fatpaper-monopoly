/**
 * MapSerializer — 地图数据与目录结构的双向转换
 *
 * 将 Pinia stores 中的 GameMap 序列化为结构化目录（代码与数据分离），
 * 支持从目录反序列化回 GameMap。
 */
import type { GameMap, MapPath } from "@mine-monopoly/types";
import { normalizeGameMap } from "@mine-monopoly/utils";
import type {
	MapItem,
	MapItemType,
	MapEvent,
	Role,
	GameMapInfo,
	CustomUI,
} from "@mine-monopoly/types/interfaces/game/item";
import type {
	ChanceCardInfo,
	GamePhaseInfo,
	UITemplate,
} from "@mine-monopoly/types/interfaces/game/game-process";
import type { FormSchema } from "@mine-monopoly/types/interfaces/game/util";
import type { ModifierTemplate } from "@mine-monopoly/types/interfaces/game/action-system/modifier";
import { getFsApi, type ExtendedFsAPI } from "./fs-api";
import { ensureMapInfoDefaults, notifyLegacyMapPathsGenerated, parseGameMapFromProtoFile } from "../utils/file/index";
import { getInitPhase } from "../views/map-editor/components/manager/process-manager/utils/init-phase";

// ─── 类型 ───

export interface ResourceFileItem {
	id: string;
	name: string;
	fileType: string;
	filePath: string; // 磁盘上的绝对路径
}

export interface DeserializeResult {
	mapData: GameMap;
	models: ResourceFileItem[];
	images: ResourceFileItem[];
}

// ─── 帮助函数 ───

const API = () => getFsApi();

/** 将 IPC 传输的 Uint8Array 正确解码为 UTF-8 文本（不能用 .toString()） */
function bufToText(buf: Uint8Array | Buffer): string {
	return new TextDecoder("utf-8").decode(buf);
}

/** 规范化路径 — 统一使用正斜杠，去除尾部分隔符 */
function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
	await API().saveFile(filePath, JSON.stringify(data, null, 2));
}

/** 原子写入 — 先写 .tmp 再 rename，防止写入中断留下半截文件 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
	const tmpPath = filePath + ".tmp";
	await API().saveFile(tmpPath, JSON.stringify(data, null, 2));
	await API().rename(tmpPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T> {
	const buf = await API().readFile(filePath);
	const text = bufToText(buf);
	try {
		return JSON.parse(text);
	} catch (e: any) {
		// 截取文件内容前 200 字符帮助诊断
		const preview = text.slice(0, 200).replace(/\n/g, "\\n");
		throw new Error(`JSON 解析失败: ${filePath}\n内容预览: ${preview}\n${e.message}`);
	}
}

async function writeText(filePath: string, text: string): Promise<void> {
	await API().saveFile(filePath, text);
}

async function readText(filePath: string): Promise<string> {
	const buf = await API().readFile(filePath);
	return bufToText(buf);
}

async function ensureTextFileContainsLines(filePath: string, lines: string[]): Promise<void> {
	const existing = (await API().exists(filePath)) ? await readText(filePath) : "";
	const normalized = existing.replace(/\r\n/g, "\n");
	const missingLines = lines.filter(line => !normalized.split("\n").includes(line));
	if (missingLines.length === 0) return;

	const needsTrailingNewline = normalized.length > 0 && !normalized.endsWith("\n");
	const next = `${normalized}${needsTrailingNewline ? "\n" : ""}${missingLines.join("\n")}\n`;
	await writeText(filePath, next);
}

async function ensureDir(dirPath: string): Promise<void> {
	if (!(await API().exists(dirPath))) {
		await API().mkdir(dirPath);
	}
}

async function copyFileToDir(srcPath: string, destPath: string): Promise<void> {
	const buf = await API().readFile(srcPath);
	await API().saveLocalFile(destPath, new Uint8Array(buf));
}

const CODE_HEADER = (_type?: string, _name?: string, _id?: string) => "";

/** 从代码内容中剥离旧版自动生成的 header 注释（兼容历史文件） */
function stripCodeHeader(code: string): string {
	const lines = code.split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trimStart().startsWith("//")) {
		i++;
	}
	if (i < lines.length && lines[i].trim() === "") {
		i++;
	}
	return lines.slice(i).join("\n");
}

const PHASE_DIRS: Record<string, string> = {
	gameOverRule: "game-over-rule",
	gameInited: "game-inited",
	playerPreInit: "player-pre-init",
	propertyPreInit: "property-pre-init",
	gameRoundStart: "game-round-start",
	playerRound: "player-round",
	gameRoundEnd: "game-round-end",
	postRestore: "post-restore",
};

/** 项目标识文件 */
const PROJECT_MARKER = ".mine-monopoly-map";

// ─── 序列化：GameMap → 目录 ───

export async function serializeToDir(mapData: GameMap, dirPath: string): Promise<void> {
	dirPath = normalizePath(dirPath);
	await ensureDir(dirPath);

	// 项目标识文件
	if (!(await API().exists(`${dirPath}/${PROJECT_MARKER}`))) {
		await writeText(`${dirPath}/${PROJECT_MARKER}`, "");
	}

	// map.json: 元信息 + 顶层简单字段（原子写入，防止损坏）
	const mapJson: Record<string, unknown> = {
		id: mapData.id,
		inUse: mapData.inUse,
		info: mapData.info,
		serverMapId: mapData.serverMapId || "",
		startMapItemId: mapData.startMapItemId,
		pathMapItemTypeIds: mapData.pathMapItemTypeIds,
	};
	await atomicWriteJson(`${dirPath}/map.json`, mapJson);

	// map-paths.json
	await writeJson(`${dirPath}/map-paths.json`, mapData.mapPaths);

	// map-index.json（旧版线性路径兼容）
	await writeJson(`${dirPath}/map-index.json`, mapData.mapIndex);

	// building-models.json
	await writeJson(`${dirPath}/building-models.json`, mapData.buildingModelIdList);

	// 各子目录
	await ensureDir(`${dirPath}/items`);
	await ensureDir(`${dirPath}/item-types`);
	await ensureDir(`${dirPath}/events`);
	await ensureDir(`${dirPath}/roles`);
	await ensureDir(`${dirPath}/cards`);
	await ensureDir(`${dirPath}/phases`);
	await ensureDir(`${dirPath}/settings`);
	await ensureDir(`${dirPath}/modifiers`);
	await ensureDir(`${dirPath}/ui-templates`);
	await ensureDir(`${dirPath}/custom-uis`);
	await ensureDir(`${dirPath}/libs`);

	// items/
	for (const item of mapData.mapItems) {
		await writeJson(`${dirPath}/items/${item.id}.json`, item);
	}

	// item-types/
	for (const t of mapData.mapItemTypes) {
		await writeJson(`${dirPath}/item-types/${t.id}.json`, t);
	}

	// events/
	for (const ev of mapData.mapEvents) {
		const { effectCode, ...meta } = ev;
		await writeJson(`${dirPath}/events/${ev.id}.json`, meta);
		if (effectCode) {
			await writeText(`${dirPath}/events/${ev.id}.code.ts`, CODE_HEADER("MapEvent", ev.name, ev.id) + effectCode);
		}
	}

	// roles/
	for (const role of mapData.roles) {
		const { initCode, ...meta } = role;
		await writeJson(`${dirPath}/roles/${role.id}.json`, meta);
		if (initCode) {
			await writeText(`${dirPath}/roles/${role.id}.init.ts`, CODE_HEADER("Role", role.name, role.id) + initCode);
		}
	}

	// cards/
	for (const card of mapData.chanceCards) {
		const { effectCode, ...meta } = card;
		await writeJson(`${dirPath}/cards/${card.id}.json`, meta);
		if (effectCode) {
			await writeText(`${dirPath}/cards/${card.id}.effect.ts`, CODE_HEADER("ChanceCard", card.name, card.id) + effectCode);
		}
	}

	// phases/
	for (const [category, phases] of Object.entries(mapData.phases)) {
		const catDir = `${dirPath}/phases/${PHASE_DIRS[category] || category}`;
		await ensureDir(catDir);
		for (const ph of phases) {
			const { initEventCode, ...meta } = ph;
			await writeJson(`${catDir}/${ph.id}.json`, meta);
			if (initEventCode) {
				await writeText(
					`${catDir}/${ph.id}.init.ts`,
					CODE_HEADER("GamePhase", ph.name, ph.id) + initEventCode,
				);
			}
		}
		// 保存顺序
		await writeJson(`${catDir}/_order.json`, phases.map((p) => p.id));
	}

	// settings/
	for (const s of mapData.gameSettingForm) {
		await writeJson(`${dirPath}/settings/${s.id}.json`, s);
	}

	// modifiers/
	for (const mod of mapData.modifierTemplates) {
		const { effectCode, ...meta } = mod;
		await writeJson(`${dirPath}/modifiers/${mod.id}.json`, meta);
		if (effectCode) {
			await writeText(`${dirPath}/modifiers/${mod.id}.code.ts`, CODE_HEADER("ModifierTemplate", mod.name, mod.id) + effectCode);
		}
	}

	// ui-templates/
	for (const tpl of mapData.uiTemplates) {
		await writeJson(`${dirPath}/ui-templates/${tpl.id}.json`, tpl);
	}

	// custom-uis/
	for (const cui of mapData.customUIs) {
		await writeJson(`${dirPath}/custom-uis/${cui.id}.json`, cui);
	}

	// libs/extra.ts
	if (mapData.extraLibs) {
		await writeText(`${dirPath}/libs/extra.ts`, mapData.extraLibs);
	}

	// ─── 清理孤儿文件（删除已在编辑器中移除但磁盘上仍残留的旧文件） ───

	// items/
	await cleanupByFilenames(`${dirPath}/items`,
		new Set(mapData.mapItems.map(i => `${i.id}.json`)));

	// item-types/
	await cleanupByFilenames(`${dirPath}/item-types`,
		new Set(mapData.mapItemTypes.map(t => `${t.id}.json`)));

	// events/
	await cleanupByFilenames(`${dirPath}/events`,
		new Set(mapData.mapEvents.flatMap(ev => {
			const files = [`${ev.id}.json`];
			if (ev.effectCode) files.push(`${ev.id}.code.ts`);
			return files;
		})));

	// roles/
	await cleanupByFilenames(`${dirPath}/roles`,
		new Set(mapData.roles.flatMap(r => {
			const files = [`${r.id}.json`];
			if (r.initCode) files.push(`${r.id}.init.ts`);
			return files;
		})));

	// cards/
	await cleanupByFilenames(`${dirPath}/cards`,
		new Set(mapData.chanceCards.flatMap(c => {
			const files = [`${c.id}.json`];
			if (c.effectCode) files.push(`${c.id}.effect.ts`);
			return files;
		})));

	// phases/ (每个 category 子目录)
	for (const [category, phases] of Object.entries(mapData.phases)) {
		const catDir = `${dirPath}/phases/${PHASE_DIRS[category] || category}`;
		await cleanupByFilenames(catDir,
			new Set(phases.flatMap(p => {
				const files = [`${p.id}.json`];
				if (p.initEventCode) files.push(`${p.id}.init.ts`);
				return files;
			}).concat(['_order.json'])));
	}

	// settings/
	await cleanupByFilenames(`${dirPath}/settings`,
		new Set(mapData.gameSettingForm.map(s => `${s.id}.json`)));

	// modifiers/
	await cleanupByFilenames(`${dirPath}/modifiers`,
		new Set(mapData.modifierTemplates.flatMap(m => {
			const files = [`${m.id}.json`];
			if (m.effectCode) files.push(`${m.id}.code.ts`);
			return files;
		})));

	// ui-templates/
	await cleanupByFilenames(`${dirPath}/ui-templates`,
		new Set(mapData.uiTemplates.map(t => `${t.id}.json`)));

	// custom-uis/
	await cleanupByFilenames(`${dirPath}/custom-uis`,
		new Set(mapData.customUIs.map(c => `${c.id}.json`)));

	// libs/ (extra.ts 被清空时需要删除旧文件)
	await cleanupByFilenames(`${dirPath}/libs`,
		new Set(mapData.extraLibs ? ['extra.ts'] : []));

	// .gitignore (每次保存时确保存在)
	const gitignorePath = `${dirPath}/.gitignore`;
	await ensureTextFileContainsLines(gitignorePath, [
		"# 临时文件",
		"*.tmp",
		"*~",
		".DS_Store",
		"Thumbs.db",
		"",
		"# 构建产物",
		"dist/",
	]);

	// .gitattributes (每次保存时确保存在)
	const gitattrsPath = `${dirPath}/.gitattributes`;
	if (!(await API().exists(gitattrsPath))) {
		await writeText(
			gitattrsPath,
			"*.ts       text\n*.json     text\nassets/**  binary -text\n",
		);
	}
}

// ─── 反序列化：目录 → GameMap ───

export async function deserializeFromDir(dirPath: string): Promise<DeserializeResult> {
	dirPath = normalizePath(dirPath);
	const mapJson = await readJson<{ id: string; inUse: boolean; info: GameMapInfo; serverMapId?: string; startMapItemId?: string; pathMapItemTypeIds?: string[] }>(`${dirPath}/map.json`);

	const mapIndex: string[] =
		(await API().exists(`${dirPath}/map-index.json`))
			? await readJson<string[]>(`${dirPath}/map-index.json`)
			: [];

	const mapPaths: MapPath[] | undefined =
		(await API().exists(`${dirPath}/map-paths.json`))
			? await readJson<MapPath[]>(`${dirPath}/map-paths.json`)
			: undefined;

	const buildingModelIdList: string[] =
		(await API().exists(`${dirPath}/building-models.json`))
			? await readJson<string[]>(`${dirPath}/building-models.json`)
			: [];

	// 子目录读取
	const mapItems = await readDirSafely<MapItem>(`${dirPath}/items`, ".json");
	const mapItemTypes = await readDirSafely<MapItemType>(`${dirPath}/item-types`, ".json");

	// events (合并 json + code.ts)
	const mapEvents = await readDirSafelyWithCode<MapEvent>(`${dirPath}/events`, ".json", ".code.ts", "effectCode");

	// roles (合并 json + init.ts)
	const roles = await readDirSafelyWithCode<Role>(`${dirPath}/roles`, ".json", ".init.ts", "initCode");

	// cards (合并 json + effect.ts)
	const chanceCards = await readDirSafelyWithCode<ChanceCardInfo>(`${dirPath}/cards`, ".json", ".effect.ts", "effectCode");

	// phases
	const phases: GameMap["phases"] = {
		gameOverRule: [],
		gameInited: [],
		playerPreInit: [],
		propertyPreInit: [],
		gameRoundStart: [],
		playerRound: [],
		gameRoundEnd: [],
		postRestore: [],
	};
	const phasesDir = `${dirPath}/phases`;
	if (await API().exists(phasesDir)) {
		for (const [category, catDirName] of Object.entries(PHASE_DIRS)) {
			const catDir = `${phasesDir}/${catDirName}`;
			if (await API().exists(catDir)) {
				const entries = await API().readDir(catDir);
				for (const entry of entries) {
					if (entry.isFile && entry.name.endsWith(".json") && entry.name !== "_order.json") {
						const id = entry.name.replace(/\.json$/, "");
						const meta = await readJson<Omit<GamePhaseInfo, "initEventCode">>(`${catDir}/${entry.name}`);
						let initEventCode = "";
						const codePath = `${catDir}/${id}.init.ts`;
						if (await API().exists(codePath)) {
							initEventCode = stripCodeHeader(await readText(codePath));
						}
						(phases as any)[category].push({ ...meta, initEventCode, id: meta.id || id });
					}
				}
				// 按 _order.json 恢复顺序
				const orderPath = `${catDir}/_order.json`;
				if (await API().exists(orderPath)) {
					const order: string[] = await readJson(orderPath);
					const arr = (phases as any)[category] as GamePhaseInfo[];
					arr.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
				}
			}
		}
	}

	// 向后兼容：旧地图没有 postRestore 阶段时，注入默认系统阶段
	if (phases.postRestore.length === 0) {
		const defaultPhases = getInitPhase();
		phases.postRestore.push(defaultPhases.postRestore[0]);
	}

	// settings
	const gameSettingForm = await readDirSafely<FormSchema>(`${dirPath}/settings`, ".json");

	// modifiers
	const modifierTemplates = await readDirSafelyWithCode<ModifierTemplate>(
		`${dirPath}/modifiers`, ".json", ".code.ts", "effectCode",
	);

	// ui-templates
	const uiTemplates = await readDirSafely<UITemplate>(`${dirPath}/ui-templates`, ".json");

	// custom-uis
	const customUIs = await readDirSafely<CustomUI>(`${dirPath}/custom-uis`, ".json");

	// extraLibs
	let extraLibs = "";
	const extraLibsPath = `${dirPath}/libs/extra.ts`;
	if (await API().exists(extraLibsPath)) {
		extraLibs = await readText(extraLibsPath);
	}

	// 组装 GameMap
	const mapData: GameMap = {
		...mapJson,
		info: ensureMapInfoDefaults(mapJson.info),
		...(mapPaths ? { mapPaths } : {}),
		mapIndex,
		buildingModelIdList,
		mapItems,
		mapItemTypes,
		mapEvents,
		roles,
		chanceCards,
		phases,
		gameSettingForm,
		modifierTemplates,
		uiTemplates,
		customUIs,
		extraLibs,
	} as GameMap;

	// 静态资源
	const models: ResourceFileItem[] = [];
	const images: ResourceFileItem[] = [];

	const assetsDir = `${dirPath}/assets`;
	if (await API().exists(assetsDir)) {
		// 读取资源元数据（名称等）
		let modelsMeta: { id: string; name: string; fileType: string }[] = [];
		const modelsMetaPath = `${assetsDir}/models-meta.json`;
		if (await API().exists(modelsMetaPath)) {
			try { modelsMeta = await readJson(modelsMetaPath); } catch { /* ignore */ }
		}
		const modelsMetaMap = new Map(modelsMeta.map((m) => [m.id, m]));

		let imagesMeta: { id: string; name: string; fileType: string }[] = [];
		const imagesMetaPath = `${assetsDir}/images-meta.json`;
		if (await API().exists(imagesMetaPath)) {
			try { imagesMeta = await readJson(imagesMetaPath); } catch { /* ignore */ }
		}
		const imagesMetaMap = new Map(imagesMeta.map((i) => [i.id, i]));

		const modelsDir = `${assetsDir}/models`;
		if (await API().exists(modelsDir)) {
			const modelEntries = await API().readDir(modelsDir);
			for (const entry of modelEntries) {
				if (entry.isFile) {
					const ext = entry.name.split(".").pop() || "";
					const id = entry.name.slice(0, entry.name.lastIndexOf("."));
					const meta = modelsMetaMap.get(id);
					models.push({
						id,
						name: meta?.name || id,
						fileType: meta?.fileType || ext,
						filePath: `${modelsDir}/${entry.name}`.replace(/\\/g, "/"),
					});
				}
			}
		}
		const imagesDir = `${assetsDir}/images`;
		if (await API().exists(imagesDir)) {
			const imageEntries = await API().readDir(imagesDir);
			for (const entry of imageEntries) {
				if (entry.isFile) {
					const ext = entry.name.split(".").pop() || "";
					const id = entry.name.slice(0, entry.name.lastIndexOf("."));
					const meta = imagesMetaMap.get(id);
					images.push({
						id,
						name: meta?.name || id,
						fileType: meta?.fileType || ext,
						filePath: `${imagesDir}/${entry.name}`.replace(/\\/g, "/"),
					});
				}
			}
		}
	}

	// 旧版目录地图（无 map-paths.json）由 mapIndex 生成路径时，弹窗告知
	if (!Array.isArray(mapPaths) && mapIndex.length > 0) notifyLegacyMapPathsGenerated(mapData);

	return { mapData: normalizeGameMap(mapData), models, images };
}

// ─── 内部工具函数 ───

async function readDirSafely<T>(dirPath: string, ext: string): Promise<T[]> {
	const result: T[] = [];
	if (!(await API().exists(dirPath))) return result;
	const entries = await API().readDir(dirPath);
	for (const entry of entries) {
		if (entry.isFile && entry.name.endsWith(ext)) {
			const data = await readJson<T>(`${dirPath}/${entry.name}`);
			result.push(data);
		}
	}
	return result;
}

async function readDirSafelyWithCode<T extends { id: string }>(
	dirPath: string,
	jsonExt: string,
	codeExt: string,
	codeField: string,
): Promise<T[]> {
	const result: T[] = [];
	if (!(await API().exists(dirPath))) return result;
	const entries = await API().readDir(dirPath);
	const jsonFiles = entries.filter((e) => e.isFile && e.name.endsWith(jsonExt));
	for (const entry of jsonFiles) {
		const id = entry.name.replace(new RegExp(`${jsonExt.replace(".", "\\.")}$`), "");
		const meta = await readJson<T>(`${dirPath}/${entry.name}`);
		let code = "";
		const codePath = `${dirPath}/${id}${codeExt}`;
		if (await API().exists(codePath)) {
			code = stripCodeHeader(await readText(codePath));
		}
		(result as any[]).push({ ...meta, [codeField]: code, id: meta.id || id });
	}
	return result;
}

/**
 * 保存静态资源文件到 assets/ 目录
 */
export async function saveAssetsToDir(
	models: { id: string; name: string; fileType: string; url: string }[],
	images: { id: string; name: string; fileType: string; url: string }[],
	dirPath: string,
): Promise<void> {
	dirPath = normalizePath(dirPath);
	const assetsDir = `${dirPath}/assets`;
	await ensureDir(assetsDir);

	const modelsDir = `${assetsDir}/models`;
	await ensureDir(modelsDir);
	const currentModelIds = new Set(models.map((m) => m.id));
	for (const model of models) {
		// 先删除该 ID 下所有旧文件（可能扩展名已变）
		await removeFilesWithId(modelsDir, model.id);
		// 写入当前版本
		const destPath = `${modelsDir}/${model.id}.${model.fileType}`;
		const localPath = convertFpUrlToPath(model.url);
		try {
			await copyFileToDir(localPath, destPath);
		} catch {
			console.warn(`Failed to copy model: ${model.id}`);
		}
	}
	await cleanupOrphanFiles(modelsDir, currentModelIds);
	// 持久化模型名称元数据
	await writeJson(`${assetsDir}/models-meta.json`, models.map((m) => ({ id: m.id, name: m.name, fileType: m.fileType })));

	const imagesDir = `${assetsDir}/images`;
	await ensureDir(imagesDir);
	const currentImageIds = new Set(images.map((i) => i.id));
	for (const image of images) {
		await removeFilesWithId(imagesDir, image.id);
		const destPath = `${imagesDir}/${image.id}.${image.fileType}`;
		const localPath = convertFpUrlToPath(image.url);
		try {
			await copyFileToDir(localPath, destPath);
		} catch {
			console.warn(`Failed to copy image: ${image.id}`);
		}
	}
	await cleanupOrphanFiles(imagesDir, currentImageIds);
	await writeJson(`${assetsDir}/images-meta.json`, images.map((i) => ({ id: i.id, name: i.name, fileType: i.fileType })));
}

/** 删除目录中指定 ID 的所有文件（不限扩展名） */
async function removeFilesWithId(dir: string, id: string): Promise<void> {
	if (!(await API().exists(dir))) return;
	const entries = await API().readDir(dir);
	for (const entry of entries) {
		if (!entry.isFile) continue;
		const entryId = entry.name.slice(0, entry.name.lastIndexOf("."));
		if (entryId === id) {
			try { await API().unlink(`${dir}/${entry.name}`); } catch { /* ignore */ }
		}
	}
}

/** 删除目录中不属于当前 ID 集合的旧文件 */
async function cleanupOrphanFiles(dir: string, currentIds: Set<string>): Promise<void> {
	if (!(await API().exists(dir))) return;
	const entries = await API().readDir(dir);
	for (const entry of entries) {
		if (!entry.isFile) continue;
		// 从文件名提取 ID（去掉扩展名）
		const id = entry.name.replace(/\.[^.]+$/, "");
		if (!currentIds.has(id)) {
			try {
				await API().unlink(`${dir}/${entry.name}`);
			} catch {
				console.warn(`Failed to remove orphan resource: ${entry.name}`);
			}
		}
	}
}

/**
 * 根据期望文件名集合清理目录中的孤儿文件。
 * 与 cleanupOrphanFiles 不同，此函数通过完整文件名精确匹配，
 * 能正确处理双扩展名文件（如 {id}.code.ts、{id}.init.ts）。
 */
async function cleanupByFilenames(dir: string, expectedFiles: Set<string>): Promise<void> {
	if (!(await API().exists(dir))) return;
	const entries = await API().readDir(dir);
	for (const entry of entries) {
		if (!entry.isFile) continue;
		if (!expectedFiles.has(entry.name)) {
			try {
				await API().unlink(`${dir}/${entry.name}`);
			} catch {
				console.warn(`Failed to remove orphan file: ${entry.name} in ${dir}`);
			}
		}
	}
}

/** 将 fp-file:// URL 转回本地绝对路径 */
function convertFpUrlToPath(urlOrPath: string): string {
	if (!urlOrPath) return "";
	if (!urlOrPath.startsWith("fp-file:")) return urlOrPath;
	let rawPath = urlOrPath.replace(/^fp-file:\/{2,3}/, "");
	if (rawPath.startsWith("/") && /^[a-zA-Z]:/.test(rawPath.slice(1))) {
		rawPath = rawPath.slice(1);
	}
	return decodeURIComponent(rawPath);
}

/** 检测路径是否为目录格式的地图 */
export async function isDirFormatMap(p: string): Promise<boolean> {
	try {
		p = normalizePath(p);
		const s = await API().statPath(p);
		if (!s.isDirectory) return false;
		return await API().exists(`${p}/${PROJECT_MARKER}`) || await API().exists(`${p}/map.json`);
	} catch {
		return false;
	}
}

// ─── 统一加载 ───

/** 资源项（统一格式，url 为 fp-file:// 路径） */
export interface LoadedResource {
	id: string;
	name: string;
	fileType: string;
	url: string;
}

/** loadMapAuto 的统一返回值 */
export interface LoadMapResult {
	mapData: GameMap;
	models: LoadedResource[];
	images: LoadedResource[];
}

/**
 * 自动检测路径格式并加载地图
 * - 目录（含 map.json）→ 走 deserializeFromDir
 * - 文件（.fpmap）→ 走 parseGameMapFromProtoFile
 * 返回统一格式，资源已写入 temp 目录并转为 fp-file:// URL
 */
export async function loadMapAuto(filePath: string): Promise<LoadMapResult> {
	filePath = normalizePath(filePath);

	try {
		const isDir = await isDirFormatMap(filePath);

		if (isDir) {
			// 清理上次原子写入可能残留的 .tmp 文件
			const tmpPath = `${filePath}/map.json.tmp`;
			if (await API().exists(tmpPath)) {
				try { await API().unlink(tmpPath); } catch { /* ignore */ }
			}

			// 目录格式
			const { mapData, models, images } = await deserializeFromDir(filePath);

		const modelResources: LoadedResource[] = [];
		for (const m of models) {
			const buf = await API().readFile(m.filePath);
			const absPath = await API().saveLocalFile(`temp/${m.id}.${m.fileType}`, new Uint8Array(buf));
			modelResources.push({
				id: m.id,
				name: m.name,
				fileType: m.fileType,
				url: `fp-file://${absPath.replace(/\\/g, "/")}`,
			});
		}

		const imageResources: LoadedResource[] = [];
		for (const img of images) {
			const buf = await API().readFile(img.filePath);
			const absPath = await API().saveLocalFile(`temp/${img.id}.${img.fileType}`, new Uint8Array(buf));
			imageResources.push({
				id: img.id,
				name: img.name,
				fileType: img.fileType,
				url: `fp-file://${absPath.replace(/\\/g, "/")}`,
			});
		}

		return { mapData, models: modelResources, images: imageResources };
	}

	// 旧格式 .fpmap 文件
	const parsed = await parseGameMapFromProtoFile(filePath);

	const modelResources: LoadedResource[] = [];
	for (const m of parsed.models) {
		const absPath = await API().saveLocalFile(`temp/${m.id}.${m.filetype}`, m.buffer);
		modelResources.push({
			id: m.id,
			name: m.name,
			fileType: m.filetype,
			url: `fp-file://${absPath.replace(/\\/g, "/")}`,
		});
	}

	const imageResources: LoadedResource[] = [];
	for (const img of parsed.images) {
		const absPath = await API().saveLocalFile(`temp/${img.id}.${img.filetype}`, img.buffer);
		imageResources.push({
			id: img.id,
			name: img.name,
			fileType: img.filetype,
			url: `fp-file://${absPath.replace(/\\/g, "/")}`,
		});
	}

	return { mapData: normalizeGameMap(parsed.mapData), models: modelResources, images: imageResources };
	} catch (e: any) {
		// 友好错误提示
		const msg = e.message || String(e);
		if (msg.includes("JSON 解析失败") || msg.includes("Unexpected")) {
			throw new Error(
				`地图文件损坏: ${filePath}\n${msg}\n\n` +
				`建议: 如果之前保存时异常退出，可尝试从「版本历史」恢复到上一个快照。`
			);
		}
		throw e;
	}
}
