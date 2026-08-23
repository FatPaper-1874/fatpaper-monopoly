import * as monaco from "monaco-editor";
import { ref } from "vue";
import loader from "@monaco-editor/loader";

// 模块级单例（编辑器与保存校验共用同一个 Monaco / TS defaults）
let monacoSingleton: typeof monaco | null = null;
let monacoInitialization: Promise<typeof monaco> | null = null;

export function getMonacoSingleton(): Promise<typeof monaco> {
	if (monacoSingleton) return Promise.resolve(monacoSingleton);

	if (!monacoInitialization) {
		loader.config({ monaco });
		monacoInitialization = loader
			.init()
			.then((instance) => {
				instance.languages.typescript.typescriptDefaults.setCompilerOptions({
					target: instance.languages.typescript.ScriptTarget.ES2020,
					allowNonTsExtensions: true,
					moduleResolution: instance.languages.typescript.ModuleResolutionKind.NodeJs,
					module: instance.languages.typescript.ModuleKind.CommonJS,
					noEmit: true,
					esModuleInterop: true,
					strict: true,
					noImplicitAny: true,
					strictNullChecks: true,
				});
				monacoSingleton = instance;
				return instance;
			})
			.catch((error) => {
				monacoInitialization = null;
				throw error;
			});
	}

	return monacoInitialization;
}

export function useMonacoInstance() {
	const monacoInstance = ref<typeof monaco | null>(null);

	let editor: monaco.editor.IStandaloneCodeEditor | null = null;
	let model: monaco.editor.ITextModel | null = null;
	let resizeObserver: ResizeObserver | null = null;

	async function initEditor(container: HTMLElement, options: {
		value: string;
		language: string;
		containerId: string;
	}): Promise<{ editor: monaco.editor.IStandaloneCodeEditor; model: monaco.editor.ITextModel }> {
		const sharedMonaco = await getMonacoSingleton();
		monacoInstance.value = sharedMonaco;

		// 创建 Model（唯一 URI，避免多实例冲突）
		const modelUri = sharedMonaco.Uri.parse(`file:///main-${options.containerId}.ts`);
		model = sharedMonaco.editor.createModel(
			options.value,
			options.language,
			modelUri,
		);

		// 创建编辑器
		editor = sharedMonaco.editor.create(container, {
			model,
			minimap: { enabled: false },
			wordWrap: "on",
			theme: "vs",
			automaticLayout: false,
			fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
			fontSize: 13,
		});

		// ResizeObserver
		resizeObserver = new ResizeObserver(() => {
			editor!.layout();
		});
		resizeObserver.observe(container);

		return { editor, model };
	}

	function destroyEditor() {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (model) {
			model.dispose();
			model = null;
		}
		if (editor) {
			editor.dispose();
			editor = null;
		}
		monacoInstance.value = null;
	}

	return { monacoInstance, initEditor, destroyEditor };
}
