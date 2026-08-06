// Teknik preset'lerin montaj + simülasyonda geçerli (finite) sonuç verdiğini doğrular.

import { describe, expect, it } from "vitest";
import { TECH_PRESETS } from "./presets";
import { assembleTech } from "./physics/assembly";
import { simulate } from "./physics/simulator";

describe("teknik preset tasarımları", () => {
  for (const p of TECH_PRESETS) {
    it(`${p.name} — montaj ve simülasyon geçerli`, () => {
      const rocket = p.build();

      const a = assembleTech(rocket);
      expect(Number.isFinite(a.liftoffMass)).toBe(true);
      expect(a.liftoffMass).toBeGreaterThan(0);
      expect(Number.isFinite(a.structureMass)).toBe(true);
      expect(Number.isFinite(a.totalLength)).toBe(true);
      expect(a.totalLength).toBeGreaterThan(0);
      expect(Number.isFinite(a.cp)).toBe(true);
      expect(Number.isFinite(a.cg)).toBe(true);
      expect(Number.isFinite(a.stability)).toBe(true);

      const res = simulate(rocket);
      expect(res.samples.length).toBeGreaterThan(2);
      for (const s of res.samples) {
        expect(Number.isFinite(s.x)).toBe(true);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(Number.isFinite(s.z)).toBe(true);
        expect(Number.isFinite(s.speed)).toBe(true);
        expect(Number.isFinite(s.massKg)).toBe(true);
      }
      expect(Number.isFinite(res.summary.apogeeM)).toBe(true);
      expect(res.summary.apogeeM).toBeGreaterThan(15);
      expect(Number.isFinite(res.summary.maxVelMps)).toBe(true);
      expect(res.summary.maxVelMps).toBeGreaterThan(10);
    });
  }
});
