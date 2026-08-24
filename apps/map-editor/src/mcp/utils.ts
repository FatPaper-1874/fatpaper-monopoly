/**
 * Utility functions for MCP Server
 */

/**
 * Generate a unique short ID
 */
export function generateId(prefix = 'item'): string {
	const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 6; i++) {
		id += CHARS[Math.floor(Math.random() * CHARS.length)];
	}
	return `${prefix}-${id}`;
}

/**
 * Create a success result
 */
export function successResult(data: any) {
	return {
		success: true,
		data,
	};
}

/**
 * Create an error result
 */
export function errorResult(message: string, code = "TOOL_EXECUTION_FAILED", details?: Record<string, unknown>) {
	return {
		success: false,
		error: message,
		errorInfo: { code, message, ...(details ? { details } : {}) },
	};
}

/**
 * Calculate distance between two coordinates
 */
export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Filter map items by coordinates
 */
export function filterMapItemsByCoordinates(
	items: any[],
	filter: { x?: number; y?: number; radius?: number }
): any[] {
	const { x, y, radius } = filter;

	if (x === undefined || y === undefined) {
		return items;
	}

	if (radius === undefined) {
		return items.filter((item) => item.x === x && item.y === y);
	}

	return items.filter((item) => calculateDistance(x, y, item.x, item.y) <= radius);
}

/**
 * Find duplicate coordinates in map items
 */
export function findDuplicateCoordinates(items: any[]): Array<{ x: number; y: number; items: string[] }> {
	const coordMap = new Map<string, string[]>();

	items.forEach((item) => {
		const key = `${item.x},${item.y}`;
		if (!coordMap.has(key)) {
			coordMap.set(key, []);
		}
		coordMap.get(key)!.push(item.id);
	});

	const duplicates: Array<{ x: number; y: number; items: string[] }> = [];

	coordMap.forEach((itemIds, key) => {
		if (itemIds.length > 1) {
			const [x, y] = key.split(",").map(Number);
			duplicates.push({ x, y, items: itemIds });
		}
	});

	return duplicates;
}

/**
 * Validate map data
 */
export function validateMap(
	items: any[],
	events: any[],
	roles: any[],
	mapIndex: string[],
	hasMapPaths = false,
): {
	errors: string[];
	warnings: string[];
	isValid: boolean;
} {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check for duplicate coordinates
	const duplicates = findDuplicateCoordinates(items);
	if (duplicates.length > 0) {
		errors.push(`Found ${duplicates.length} duplicate coordinate(s)`);
	}

	// Check map index
	if (mapIndex.length === 0 && !hasMapPaths) {
		errors.push("Map index is empty and no MapPath V2 graph is configured");
	} else if (mapIndex.length > 0) {
		// Verify all items in map index exist
		const itemIds = new Set(items.map((i) => i.id));
		mapIndex.forEach((itemId) => {
			if (!itemIds.has(itemId)) {
				warnings.push(`Map index contains non-existent item: ${itemId}`);
			}
		});
	}

	// Check for orphaned linked items
	items.forEach((item) => {
		if (item.linkto && !items.find((i) => i.id === item.linkto)) {
			errors.push(`Item ${item.id} links to non-existent item ${item.linkto}`);
		}
		if (item.beLinked && !item.property) {
			warnings.push(`Linked item ${item.id} does not have property data`);
		}
	});

	return {
		errors,
		warnings,
		isValid: errors.length === 0,
	};
}

/**
 * Analyze map layout
 */
export function analyzeMapLayout(items: any[]) {
	if (items.length === 0) {
		return {
			bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
			emptySpots: [],
			clusters: [],
		};
	}

	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;

	items.forEach((item) => {
		minX = Math.min(minX, item.x);
		maxX = Math.max(maxX, item.x);
		minY = Math.min(minY, item.y);
		maxY = Math.max(maxY, item.y);
	});

	return {
		bounds: { minX, maxX, minY, maxY },
		emptySpots: [],
		clusters: [],
	};
}
