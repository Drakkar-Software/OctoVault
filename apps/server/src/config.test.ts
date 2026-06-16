import { describe, it, expect } from "vitest";
import { config } from "./config.js";

describe("collection config", () => {
  it("objsnap is registered before objlog", () => {
    // The server matches routes in registration order. Both objlog and objsnap use a
    // greedy {objectId} segment; without objsnap listed first, a pull on
    // …/objects/logs/obj-X__snapshot is captured by the append-only objlog route
    // and returns 400 pull_bound_required instead of a normal LWW pull.
    const names = config.collections.map((c) => c.name);
    const snapIdx = names.indexOf("objsnap");
    const logIdx = names.indexOf("objlog");
    expect(snapIdx).toBeGreaterThanOrEqual(0);
    expect(logIdx).toBeGreaterThanOrEqual(0);
    expect(snapIdx).toBeLessThan(logIdx);
  });

  it("objsnap is not append-only (it is the LWW sibling, not the log)", () => {
    const objsnap = config.collections.find((c) => c.name === "objsnap");
    expect(objsnap?.appendOnly).toBeUndefined();
  });

  it("objlog is append-only", () => {
    const objlog = config.collections.find((c) => c.name === "objlog");
    expect(objlog?.appendOnly).toBeDefined();
  });
});
