import { describe, it, expect } from "vitest";
import { checkAcceptance, expectedApogeeRange } from "./acceptance";
import { defaultStage, RocketConfig } from "../types";
import { assembleRocket } from "./rocket";
import { simulateFlight } from "./trajectory";
import { defaultTechRocket } from "../tech/model";
import { assembleTech } from "../tech/physics/assembly";
import { simulate } from "../tech/physics/simulator";

function casualAlpha(): RocketConfig {
  const stage = defaultStage();
  stage.body.lengthM = 0.262;
  stage.body.diameterM = 0.0249;
  stage.body.wallM = 0.0009;
  stage.body.material = "kraft";
  stage.body.paint = true;
  stage.nose.profile = "tangentOgive";
  stage.nose.lengthCalibers = 2;
  stage.nose.hollow = true;
  stage.fins.count = 3;
  stage.fins.geometry = "rectangular";
  stage.fins.rootChordM = 0.08;
  stage.fins.tipChordM = 0.06;
  stage.fins.semispanM = 0.045;
  stage.fins.xPosM = 0.16;
  stage.fins.material = "balsa";
  stage.motor.choice = { kind: "estes", id: "C6-7", count: 1 };
  stage.recovery = { type: "parachute", diameterM: 0.3, material: "plastic", trigger: "delay", timerSeconds: 2, shockCordM: 0.6, drogueDiaM: 0 };
  return {
    name: "Estes Alpha", stages: [stage], boosterCount: 0,
    boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 1 }, throttle: 1 },
    windMps: 2, windDeg: 0, railM: 1.2, railTiltDeg: 0, dt: 0.01,
  };
}

describe("kabul eşikleri", () => {
  it("tüm kurallar ok durumunda olumlu döner", () => {
    const checks = checkAcceptance({
      stabilityCalibers: 1.4, twr: 9.5, landingVelMps: 3.3, apogeeM: 218, motorTotalImpulse: 8.8,
    });
    expect(checks.every((c) => c.severity === "ok")).toBe(true);
  });

  it("dengesiz tasarım 'bad', sınırda 'warn' üretir", () => {
    const bad = checkAcceptance({ stabilityCalibers: 0.3, twr: 9.5, landingVelMps: 3, apogeeM: 200, motorTotalImpulse: 8.8 });
    expect(bad.find((c) => c.key === "stability")!.severity).toBe("bad");
    const warn = checkAcceptance({ stabilityCalibers: 0.7, twr: 9.5, landingVelMps: 3, apogeeM: 200, motorTotalImpulse: 8.8 });
    expect(warn.find((c) => c.key === "stability")!.severity).toBe("warn");
    expect(bad.some((c) => c.key === "landing" && c.severity === "ok")).toBe(true);
  });

  it("düşük TWR ve sert iniş 'bad' üretir; uçuşsuz iniş raporu 'bad' değildir", () => {
    const c = checkAcceptance({ stabilityCalibers: 1.2, twr: 1.2, landingVelMps: 15, apogeeM: 100, motorTotalImpulse: 2.5 });
    expect(c.find((x) => x.key === "twr")!.severity).toBe("bad");
    expect(c.find((x) => x.key === "landing")!.severity).toBe("bad");
    const noFlight = checkAcceptance({ stabilityCalibers: 1.2, twr: 1.2, landingVelMps: null, apogeeM: 0, motorTotalImpulse: 2.5 });
    expect(noFlight.find((x) => x.key === "landing")!.severity).toBe("ok");
  });

  it("apogee sınıf bandı sınır dışıyken 'warn' üretir", () => {
    const [lo, hi] = expectedApogeeRange(8.8); // C sınıfı
    const warn = checkAcceptance({ stabilityCalibers: 1, twr: 5, landingVelMps: 3, apogeeM: hi + 400, motorTotalImpulse: 8.8 });
    expect(warn.find((x) => x.key === "apogee")!.severity).toBe("warn");
    expect(lo).toBeLessThan(hi);
  });
});

describe("çapraz mod tutarlılığı (casual ↔ tech)", () => {
  it("aynı Alpha + C6-7 iki modda da benzer apogee üretir (±%15)", () => {
    const c = assembleRocket(casualAlpha());
    const r = simulateFlight({ assembly: c, throttle: 1, prediction: true });
    const t = defaultTechRocket();
    const res = simulate(t);
    const ratio = Math.abs(res.summary.apogeeM - r.maxAltM) / r.maxAltM;
    expect(ratio).toBeLessThan(0.15);
    // İkisi de C-sınıfı beklenen aralıkta
    const [lo, hi] = expectedApogeeRange(8.8);
    expect(r.maxAltM).toBeGreaterThan(lo);
    expect(res.summary.apogeeM).toBeLessThan(hi + 100);
  });

  it("tech tarafında TWR hesabı var ve Alpha için ~9.5", () => {
    const a = assembleTech(defaultTechRocket());
    expect(a.twr).toBeGreaterThan(7);
    expect(a.twr).toBeLessThan(12);
  });

  it("eksik dt savunması: dt'siz config NaN üretmez ve hızla biter", () => {
    const cfg = casualAlpha();
    delete (cfg as Partial<RocketConfig>).dt;
    const a = assembleRocket(cfg);
    const r = simulateFlight({ assembly: a, throttle: 1, prediction: true });
    expect(Number.isFinite(r.maxAltM)).toBe(true);
    expect(r.maxAltM).toBeGreaterThan(100);
  });
});