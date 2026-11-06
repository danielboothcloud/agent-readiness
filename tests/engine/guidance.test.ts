import { describe, expect, test } from "vitest";
import { PILLAR_GUIDANCE } from "../../src/engine/guidance.js";
import { ALL_PILLARS } from "../../src/pillars/index.js";

describe("PILLAR_GUIDANCE", () => {
  test("every pillar explains why it matters and asks questions", () => {
    for (const p of ALL_PILLARS) {
      const g = PILLAR_GUIDANCE[p.id];
      expect(g?.why.length ?? 0, p.id).toBeGreaterThan(40);
      expect(g?.explore.length ?? 0, p.id).toBeGreaterThan(0);
      expect(
        g?.explore.every((q) => q.endsWith("?")),
        p.id,
      ).toBe(true);
    }
  });

  test("has no entries for unknown pillars", () => {
    const ids = ALL_PILLARS.map((p) => p.id);
    expect(
      Object.keys(PILLAR_GUIDANCE).filter((k) => !ids.includes(k)),
    ).toEqual([]);
  });
});
