import * as monaco from "monaco-editor";
import { mapContentService } from "@src/services";
import { eventBus } from "@src/utils/event-bus";
import staticEditorLib from "../editor-lib.d.ts?raw";
import {
	type CodeTemplateExtraParams,
	type EditorCodeType,
	resolveValidationTemplateConfig,
} from "../code-templates";

// 监听类型刷新事件
eventBus.on("refresh-monaco-types", () => {
	// 清除 Monaco Promise 缓存，强制重新初始化
	monacoPromise = null;
});

/**
 * 验证结果
 */
export interface ValidateResult {
	valid: boolean;
	errors: Array<{ line: number; column: number; message: string }>;
}

export interface ValidateTemplateOptions extends CodeTemplateExtraParams {
	template?: string;
	mode?: "snippet" | "full";
}

/**
 * 使用 Monaco TS 语言服务校验 effectCode
 *
 * 不依赖编辑器实例，直接创建临时 model 利用已注入的 extraLibs 进行类型检查。
 */
export function useMonacoValidator() {
	/**
	 * 校验代码
	 * @param code 用户代码片段（不含模板包装）
	 * @param codeType 代码类型
	 * @param commandType 命令类型（仅修饰器需要，用于生成精确模板）
	 * @returns 校验结果
	 */
	async function validate(
		code: string,
		codeType: string,
		options?: string | ValidateTemplateOptions,
	): Promise<ValidateResult> {
		const normalizedOptions: ValidateTemplateOptions =
			typeof options === "string" ? { commandType: options } : (options || {});
		const normalizedCodeType = codeType as EditorCodeType;
		const supportedCodeTypes: EditorCodeType[] = [
			"chance-card",
			"map-event",
			"role",
			"game-phase",
			"modifier",
			"property",
			"extra-libs",
		];

		if (!supportedCodeTypes.includes(normalizedCodeType)) {
			return {
				valid: false,
				errors: [{ line: 0, column: 0, message: `Unknown codeType: ${codeType}` }],
			};
		}

		// 获取全局 Monaco 单例
		const monacoInstance = await getMonacoInstance();
		if (!monacoInstance) {
			return {
				valid: false,
				errors: [{ line: 0, column: 0, message: "Monaco instance not available" }],
			};
		}

		const mode = normalizedOptions.mode || "snippet";
		const { header, footer } = resolveValidationTemplateConfig(normalizedCodeType, normalizedOptions);
		const fullCode = mode === "full" ? code : header + code + (footer ? "\n" + footer : "");
		const lineOffset = mode === "full" ? 0 : Math.max(0, header.split("\n").length - 1);

		// 注入完整类型库到 Monaco TS 语言服务
		const tsDefaults = monacoInstance.languages.typescript.typescriptDefaults;
		const libs: { content: string; filePath: string }[] = [];

		// 静态类型（enum、interface 等）
		if (staticEditorLib) {
			libs.push({ content: staticEditorLib, filePath: 'file:///static-types.d.ts' });
		}

		// 额外库代码（用户自定义 + 动态类型 + 游戏设置）
		try {
			const dynamicLibs = await mapContentService.getAllTypeLibs();
			if (dynamicLibs.extraLibs) {
				libs.push({ content: dynamicLibs.extraLibs, filePath: 'file:///extra-libs.d.ts' });
			}
			if (dynamicLibs.gameSettingTypes) {
				libs.push({ content: dynamicLibs.gameSettingTypes, filePath: 'file:///game-settings.d.ts' });
			}
			if (dynamicLibs.modifierTemplateTypes) {
				libs.push({ content: dynamicLibs.modifierTemplateTypes, filePath: 'file:///modifier-templates.d.ts' });
			}
			if (dynamicLibs.uiTemplateTypes) {
				libs.push({ content: dynamicLibs.uiTemplateTypes, filePath: 'file:///ui-templates.d.ts' });
			}
		} catch {
			// extra libs not available, continue with static only
		}

		if (libs.length === 0) {
			return { valid: false, errors: [{ line: 0, column: 0, message: "No type libraries available" }] };
		}

		// 保存当前 extraLibs，校验完成后恢复，避免影响 UI 编辑器。
		// getExtraLibs 返回的是以文件路径为键的对象，setExtraLibs 则只接受数组。
		const prevLibs = Object.entries(tsDefaults.getExtraLibs()).map(([filePath, lib]) => ({
			content: lib.content,
			filePath,
		}));
		// 强制清除 Monaco 缓存，确保使用最新类型
		tsDefaults.setExtraLibs([]);
		await new Promise(resolve => setTimeout(resolve, 0)); // 给 Monaco 处理时间
		tsDefaults.setExtraLibs(libs);

		// 创建临时 model
		const uri = monacoInstance.Uri.parse(`file:///validate-${Date.now()}.ts`);
		const model = monacoInstance.editor.createModel(fullCode, "typescript", uri);

		try {
			// 等待 TS worker 产出诊断（使用 debounce 确保分析完成）
			const markers = await waitForDiagnostics(monacoInstance, uri, 5000);

			// 提取错误
			const userCodeLineCount = code.split("\n").length;
			const errors: ValidateResult["errors"] = [];

			for (const marker of markers) {
				if (marker.severity !== monacoInstance.MarkerSeverity.Error) continue;
				const userLine = marker.startLineNumber - lineOffset;
				// header 区域错误（如类型解析失败）也要报告，因为可能意味着类型推断失效
				if (mode === "snippet" && userLine <= 0) {
					errors.push({
						line: 0,
						column: marker.startColumn,
						message: `[初始化错误] ${marker.message}`,
					});
				} else if (mode === "full" || userLine <= userCodeLineCount) {
					errors.push({
						line: mode === "full" ? marker.startLineNumber : userLine,
						column: marker.startColumn,
						message: marker.message,
					});
				}
			}

			return { valid: errors.length === 0, errors };
		} finally {
			model.dispose();
			// 恢复 extraLibs，避免影响 UI 编辑器的类型提示
			tsDefaults.setExtraLibs(prevLibs);
		}
	}

	return { validate };
}

/**
 * 获取已初始化的 Monaco 全局单例
 */
let monacoPromise: Promise<typeof monaco | null> | null = null;

function getMonacoInstance(): Promise<typeof monaco | null> {
	if (!monacoPromise) {
		monacoPromise = import("monaco-editor").then((m): typeof monaco => {
			// 检查是否已初始化 compiler options
			const defaults = m.languages.typescript.typescriptDefaults;
			try {
				defaults.setCompilerOptions({
					target: m.languages.typescript.ScriptTarget.ES2020,
					allowNonTsExtensions: true,
					moduleResolution: m.languages.typescript.ModuleResolutionKind.NodeJs,
					module: m.languages.typescript.ModuleKind.CommonJS,
					noEmit: true,
					esModuleInterop: true,
					strict: true,
					noImplicitAny: true,
					strictNullChecks: true,
				});
			} catch {
				// compiler options already set
			}
			return m;
		}).catch(() => null);
	}
	return monacoPromise;
}

/**
 * 等待 Monaco TS worker 产出指定 URI 的诊断信息
 *
 * 使用 debounce 机制确保 TS worker 完成全部分析后再返回结果。
 * TS worker 可能分多批次产出诊断（语法分析 → 语义分析），
 * 只有在 markers 稳定后（500ms 内无新事件）才确认完成。
 */
function waitForDiagnostics(
	monacoInstance: typeof monaco,
	uri: monaco.Uri,
	timeoutMs: number,
): Promise<monaco.editor.IMarker[]> {
	return new Promise((resolve) => {
		const key = uri.toString();
		let done = false;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const finish = (markers: monaco.editor.IMarker[]) => {
			if (done) return;
			done = true;
			if (debounceTimer) clearTimeout(debounceTimer);
			disposable.dispose();
			resolve(markers);
		};

		// 监听 markers 变化，使用 debounce 等待 TS worker 分析完成
		const disposable = monacoInstance.editor.onDidChangeMarkers((uris) => {
			if (uris.some((u) => u.toString() === key)) {
				// 每次收到新的 markers，重置 debounce timer
				// 只有在 markers 稳定后才确认完成
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					const markers = monacoInstance.editor.getModelMarkers({ resource: uri });
					finish(markers);
				}, 500);
			}
		});

		// 全局超时兜底
		setTimeout(() => {
			if (done) return;
			const markers = monacoInstance.editor.getModelMarkers({ resource: uri });
			finish(markers);
		}, timeoutMs);
	});
}
