import { describe, expect, it } from "vitest";
import type { MapPath } from "@mine-monopoly/types";
import {
	buildMapPathAdjacency,
	filterEnabledMapPaths,
	getAvailableMapPaths,
	getInitialEnabledMapPathIds,
	getMapItemIdFromPositionIndex,
	getPositionIndexFromMapItemId,
	selectDefaultMapPath,
} from "./map";

const paths: MapPath[] = [
	{ id: "z-first", fromMapItemId: "start", toMapItemId: "left" },
	{ id: "a-second", fromMapItemId: "start", toMapItemId: "right", initEnable: false },
	{ id: "middle", fromMapItemId: "left", toMapItemId: "finish" },
	{ id: "return", fromMapItemId: "finish", toMapItemId: "start" },
];

describe("MapPath V2 map utilities", () => {
	it("builds forward and reverse adjacency while retaining mapPaths order", () => {
		const adjacency = buildMapPathAdjacency(paths);

		expect(adjacency.outgoing.get("start")?.map((path) => path.id)).toEqual(["z-first", "a-second"]);
		expect(adjacency.incoming.get("start")?.map((path) => path.id)).toEqual(["return"]);
	});

	it("filters static and runtime enabled paths", () => {
		expect(getInitialEnabledMapPathIds(paths)).toEqual(["z-first", "middle", "return"]);
		expect(filterEnabledMapPaths(paths).map((path) => path.id)).toEqual(["z-first", "middle", "return"]);
		expect(filterEnabledMapPaths(paths, new Set(["a-second"])).map((path) => path.id)).toEqual(["a-second"]);
	});

	it("gets enabled candidates for both actual movement directions", () => {
		const adjacency = buildMapPathAdjacency(paths);
		const enabledPathIds = new Set(["z-first", "a-second", "middle", "return"]);

		expect(getAvailableMapPaths(adjacency, "start", "forward", enabledPathIds).map((path) => path.id))
			.toEqual(["z-first", "a-second"]);
		expect(getAvailableMapPaths(adjacency, "start", "reverse", enabledPathIds).map((path) => path.id))
			.toEqual(["return"]);
	});

	it("maps old positionIndex values without silently wrapping invalid snapshots", () => {
		const mapIndex = ["start", "left", "finish"];

		expect(getMapItemIdFromPositionIndex(1, mapIndex)).toBe("left");
		expect(getMapItemIdFromPositionIndex(-1, mapIndex)).toBeUndefined();
		expect(getMapItemIdFromPositionIndex(3, mapIndex)).toBeUndefined();
		expect(getPositionIndexFromMapItemId("finish", mapIndex)).toBe(2);
		expect(getPositionIndexFromMapItemId("missing", mapIndex)).toBeUndefined();
	});

	it("uses mapPaths source order for deterministic default selection", () => {
		const selected = selectDefaultMapPath([paths[0], paths[1]]);

		expect(selected?.id).toBe("z-first");
	});
});
