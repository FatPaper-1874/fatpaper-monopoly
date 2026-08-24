import type * as monaco from "monaco-editor";
import { useMapDataStore } from "@src/stores";
import staticEditorLib from "../editor-lib.d.ts?raw";
import { getMonacoSingleton } from "./useMonacoInstance";
import { syncMonacoTypeLibs } from "./useMonacoTypeLibs";
import {
	type CodeTemplateExtraParams,
	type EditorCodeType,
	resolveValidationTemplateConfig,
} from "../code-templates";

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
 * 使用 Monaco TS 语言服务校验 effectCode。
 *
 * 校验器与界面编辑器共用 Monaco 单例、compiler options 和 extra libs；
 * 不再在保存时清空或恢复类型库。
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

		let monacoInstance: typeof monaco;
		try {
			monacoInstance = await getMonacoSingleton();
		} catch {
			return {
				valid: false,
				errors: [{ line: 0, column: 0, message: "Monaco instance not available" }],
			};
		}

		// 使用与编辑器完全相同的类型库来源。若类型已是最新内容，不会触发 TS worker 重载。
		const mapDataStore = useMapDataStore();
		syncMonacoTypeLibs(monacoInstance, {
			staticTypes: staticEditorLib,
			extraLibs: mapDataStore.extraLibs || "",
			uiTemplates: mapDataStore.uiTemplates || [],
			gameSettingForm: mapDataStore.gameSettingForm || [],
			modifierTemplates: mapDataStore.modifierTemplates || [],
		});

		const mode = normalizedOptions.mode || "snippet";
		const { header, footer } = resolveValidationTemplateConfig(normalizedCodeType, normalizedOptions);
		const fullCode = mode === "full" ? code : header + code + (footer ? "\n" + footer : "");
		const lineOffset = mode === "full" ? 0 : Math.max(0, header.split("\n").length - 1);

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
		}
	}

	return { validate };
}

/**
 * 等待 Monaco TS worker 产出指定 URI 的诊断信息。
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
