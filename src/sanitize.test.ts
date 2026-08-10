// sanitizeConfig: içe aktarılan tasarım JSON'unun dayanıklılık testleri.

import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./sanitize";
import { defaultConfig } from "./types";

describe("sanitizeConfig", () => {
  it("geçerli config'i korur", () => {
    const cfg = defaultConfig();
    const out = sanitizeConfig(cfg);
    expect(out.stages.length).toBe(1);
    expect(out.stages[0].body.diameterM).toBe(cfg.stages[0].body.diameterM);
    expect(out.boosterCount).toBe(0);
  });

  it("bozuk JSON girişini çökertmez, varsayılanlara döner", () => {
    const out = sanitizeConfig(null);
    expect(out.stages.length).toBe(1);
    expect(out.stages[0].body.lengthM).toBeGreaterThan(0);
    const out2 = sanitizeConfig({ stages: [{}] });
    expect(out2.stages.length).toBe(1);
    expect(out2.stages[0].motor.choice.kind).toBe("estes");
    // Tüm alanlar finite olmalı (NaN/Infinity sızmaz)
    const s = out2.stages[0];
    for (const v of [s.body.lengthM, s.body.diameterM, s.body.wallM, s.fins.semispanM, s.recovery.diameterM, s.payload.cargoKg]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("limit dışı değerleri sınırlara klamplar", () => {
    const out = sanitizeConfig({
      name: "X",
      stages: [{
        body: { lengthM: 999, diameterM: -5, wallM: 0.5 },
        motor: { choice: { kind: "estes", id: "C6-7", count: 99 }, throttle: 0.0001 },
      }],
      boosterCount: 7,
      windMps: 1e309, // Infinity
      dt: 0,
    });
    const s = out.stages[0];
    expect(s.body.lengthM).toBeLessThanOrEqual(3);
    expect(s.body.diameterM).toBeGreaterThanOrEqual(0.01);
    expect(s.body.wallM).toBeLessThanOrEqual(0.01);
    expect(s.motor.choice.kind === "estes" && s.motor.choice.count).toBeLessThanOrEqual(4);
    expect(s.motor.throttle).toBeGreaterThanOrEqual(0.1);
    expect(out.boosterCount).toBe(0);
    expect(out.windMps).toBeLessThanOrEqual(20);
    expect(out.dt).toBeGreaterThanOrEqual(0.002);
  });

  it("kademe sayısını 3'e kırpar, 0 kademeyi 1'e tamamlar", () => {
    const ten = { stages: Array.from({ length: 10 }, () => ({})) };
    expect(sanitizeConfig(ten).stages.length).toBe(3);
    expect(sanitizeConfig({ stages: [] }).stages.length).toBe(1);
    expect(sanitizeConfig({}).stages.length).toBe(1);
  });

  it("bilinmeyen enum değerlerini varsayılana çeker", () => {
    const out = sanitizeConfig({
      stages: [{
        nose: { profile: "totallyFake" },
        fins: { geometry: "hexagon", airfoil: "hyper" },
        recovery: { type: "wings", trigger: "moonphase", material: "unobtainium" },
        payload: { avionics: "AI" },
      }],
    });
    const s = out.stages[0];
    expect(s.nose.profile).toBe("tangentOgive");
    expect(s.fins.geometry).toBe("rectangular");
    expect(s.fins.airfoil).toBe("flat");
    expect(s.recovery.type).toBe("parachute");
    expect(s.recovery.trigger).toBe("delay");
    expect(s.recovery.material).toBe("plastic");
    expect(s.payload.avionics).toBe("none");
  });

  it("sanitize edilmiş config simülasyonda çökmez (round-trip güvenliği)", async () => {
    const { assembleRocket } = await import("./physics/rocket");
    const { simulateFlight } = await import("./physics/trajectory");
    const evil = sanitizeConfig({
      stages: [
        { body: { lengthM: 0, diameterM: 0, wallM: -1 }, motor: { choice: { kind: "apcp", cls: "ZZ", avgThrustN: -5, delay: 999, impulsePct: 9, grain: "pasta", count: -3 }, throttle: 0 } },
        { body: { lengthM: NaN, diameterM: Infinity }, motor: { choice: { kind: "liquid", fuel: "antimatter", thrustN: NaN, propMassKg: -1, dryFraction: 99, count: 5 } } },
      ],
      boosterCount: 3,
    });
    expect(evil.stages.length).toBe(2);
    const a = assembleRocket(evil);
    const r = simulateFlight({ assembly: a, throttle: 1 });
    expect(Number.isFinite(r.maxAltM)).toBe(true);
    expect(r.telemetry.length).toBeGreaterThan(0);
  });
});
