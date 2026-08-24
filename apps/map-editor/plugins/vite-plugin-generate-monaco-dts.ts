import fs from "fs";
import path from "path";
import { generateDtsBundle } from "dts-bundle-generator";

export default function generateMonacoDTS() {
	function createTempConfig(workspaceRoot: string, tempPath: string) {
		const config = {
			extends: "../../tsconfig.json",
			compilerOptions: {
				baseUrl: "../../",
				paths: {
					"@mine-monopoly/types": ["packages/types/index.ts"],
				},
				rootDir: "../../",
			},
			include: ["../../packages/**/*", "src/**/*"],
		};
		fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
	}

	function generateForFile(tsFile: string) {
		const outDir = path.dirname(tsFile);
		// 获取当前应用目录 (apps/map-editor)
		const appDir = process.cwd();
		// 获取 Workspace 根目录
		const workspaceRoot = path.resolve(appDir, "../../");

		// 生成临时 tsconfig 文件的路径
		const tempConfigPath = path.resolve(appDir, "tsconfig.monaco-temp.json");

		console.log(`[monaco-dts] Generating for: ${path.basename(tsFile)}`);

		try {
			createTempConfig(workspaceRoot, tempConfigPath);

			const content = generateDtsBundle(
				[
					{
						filePath: tsFile,
						output: {
							noBanner: true,
							inlineDeclareGlobals: true,
						},
						libraries: {
							inlinedLibraries: ["mitt", "@mine-monopoly/types"],
						},
					},
				],
				{
					preferredConfigPath: tempConfigPath,
				},
			);

			const targetPath = path.join(outDir, path.basename(tsFile, path.extname(tsFile)) + ".d.ts");

			const globalContent = toGlobalDts(content[0]);

			fs.writeFileSync(targetPath, globalContent, "utf8");
			console.log(`[monaco-dts] Success: ${path.relative(process.cwd(), targetPath)}`);
		} catch (e: any) {
			console.error(`[monaco-dts] Error processing ${path.basename(tsFile)}:`);
			if (e.message) {
				console.error(e.message.split("\n").slice(0, 8).join("\n"));
			} else {
				console.error(e);
			}
		} finally {
			if (fs.existsSync(tempConfigPath)) {
				fs.unlinkSync(tempConfigPath);
			}
		}
	}

	function scanAndGenerate() {
		function walk(dir: string) {
			if (!fs.existsSync(dir)) return;
			const files = fs.readdirSync(dir, { withFileTypes: true });

			for (const file of files) {
				const fullPath = path.join(dir, file.name);
				if (file.isDirectory()) {
					walk(fullPath);
				} else if (file.isFile() && file.name.endsWith(".ts")) {
					try {
						const fd = fs.openSync(fullPath, "r");
						const buffer = Buffer.alloc(30);
						fs.readSync(fd, buffer as any, 0, 30, 0);
						fs.closeSync(fd);

						const NEED_PARSE_FLAG = "//" + "@need-to-parse";
						if (buffer.toString().includes(NEED_PARSE_FLAG)) {
							generateForFile(fullPath);
						}
					} catch (err) {
						// ignore
					}
				}
			}
		}
		walk(path.resolve(process.cwd(), "src"));
	}

	return {
		name: "vite-plugin-generate-monaco-dts",
		buildStart() {
			scanAndGenerate();
		},
		configureServer(server: any) {
			const appDir = process.cwd();
			const typeSourceDir = path.resolve(appDir, "../../packages/types");

			// editor-lib.ts 只会直接变更自身；基础类型位于 workspace 的 packages/types，
			// 必须显式加入 watcher，才能在 dev 期间自动重新生成 editor-lib.d.ts。
			server.watcher.add(path.join(typeSourceDir, "**/*.ts"));

			const regenerateForTypeChange = (file: string) => {
				if (!file.endsWith(".ts")) return;

				const relativeToTypes = path.relative(typeSourceDir, file);
				const isTypeSource = relativeToTypes && !relativeToTypes.startsWith("..") && !path.isAbsolute(relativeToTypes);
				if (isTypeSource) {
					console.log(`[monaco-dts] Base type changed: ${path.basename(file)}`);
					scanAndGenerate();
					return;
				}

				if (fs.existsSync(file)) {
					const content = fs.readFileSync(file, "utf-8");
					if (content.includes("//@need-to-parse")) {
						console.log(`[monaco-dts] Entry file changed: ${path.basename(file)}`);
						generateForFile(file);
					}
				}
			};

			server.watcher.on("change", regenerateForTypeChange);
			server.watcher.on("add", regenerateForTypeChange);
			server.watcher.on("unlink", regenerateForTypeChange);
		},
	};
}

/**
 * 将 d.ts 扁平化处理
 */
function toGlobalDts(modularContent: string): string {
	let text = modularContent;
	text = text.replace(/^\s*import\s+.*$/gm, "");
	text = text.replace(/export\s*\{[\s\S]*?\}\s*;?/g, "");
	text = text.replace(/^\s*export\s*\{\s*[^}]*\}\s*;?\s*$/gm, "");
	text = text.replace(/^\s*export\s*;\s*$/gm, "");
	text = text.replace(/^\s*export\s+declare\b/gm, "declare");
	text = text.replace(/^\s*export\s+(interface|type|class|function|const|let|var|enum|namespace)\b/gm, "$1");
	text = text.replace(/^\s*export\s+default\s+interface\b/gm, "interface");
	text = text.replace(/^\s*export\s+default\s+class\b/gm, "class");
	text = text.replace(/^\s*export\s+default\s+type\b/gm, "type");
	text = text.replace(/^\s*export\s+default\s+function\b/gm, "function");
	text = text.replace(/^\s*export\s+default\s+/gm, "");
	text = text.replace(/declare\s+global\s*\{/g, "");
	text = text
		.split(/\r?\n/)
		.filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""))
		.join("\n")
		.trim();
	return text + "\n";
}
