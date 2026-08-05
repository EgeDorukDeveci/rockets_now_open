// Fizik doğrulama testleri.
// Kabul kriterleri (doküman §9):
//  - Estes Alpha + C6-7 → apogee 150-220 m
//  - Vakum modunda Tsiolkovsky ±%1
// Ayrıca: NAR sınıf aralıkları, Barrowman CP, ISA atmosfer, itki eğrisi bütünlüğü.

import { describe, expect, it } from "vitest";
import { atmosphere } from "./atmosphere";
import { barrowmanFins, barrowmanNose } from "./barrowman";
import { classFromImpulse } from "./motors/types";
import { ESTES_MOTORS } from "./motors/catalog";
import { curveTotalImpulse, generateThrustCurve } from "./motors/curve";
import { assembleRocket } from "./rocket";
import { simulateFlight } from "./trajectory";
import { defaultStage, RocketConfig } from "../types";

/** Estes Alpha benzeri roket: 31.2 cm, 24.9 mm, 3 balsa kanat, C6-7. */
function alphaConfig(): RocketConfig {
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
    name: "Estes Alpha",
    stages: [stage],
    boosterCount: 0,
    boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 1 }, throttle: 1 },
    windMps: 2,
    windDeg: 0,
    railM: 1.2,
    railTiltDeg: 0,
    dt: 0.01,
  };
}

describe("ISA atmosfer", () => {
  it("deniz seviyesinde standart değerler", () => {
    const a = atmosphere(0);
    expect(a.T).toBeCloseTo(288.15, 3);
    expect(a.P).toBeCloseTo(101325, 0);
    expect(a.rho).toBeCloseTo(1.225, 2);
    expect(a.a).toBeCloseTo(340.29, 0);
  });
  it("11 km'de sıcaklık 216.65 K", () => {
    expect(atmosphere(11000).T).toBeCloseTo(216.65, 1);
  });
  it("20 km üstünde yoğunluk çok düşer", () => {
    const rho20 = atmosphere(20000).rho;
    expect(rho20).toBeLessThan(atmosphere(0).rho * 0.1);
  });
  it("mezosfer (51-86 km) fiziksel değerlerde kalır (eski clamp hatası)", () => {
    // Eski hata: 51 km üstünde delta -40000'a kapanıyordu → T=350 K, P≈5000 Pa.
    const a60 = atmosphere(60000);
    expect(a60.T).toBeGreaterThan(240);
    expect(a60.T).toBeLessThan(260);
    expect(a60.rho).toBeGreaterThan(1e-4);
    expect(a60.rho).toBeLessThan(5e-4);
    expect(atmosphere(86000).T).toBeCloseTo(200.65, 0);
    // Yoğunluk mezosferde monoton azalmalı
    expect(atmosphere(70000).rho).toBeLessThan(atmosphere(60000).rho);
    expect(atmosphere(80000).rho).toBeLessThan(atmosphere(70000).rho);
  });
});

describe("NAR motor sınıfları", () => {
  it("sınıf aralıkları doğru", () => {
    expect(classFromImpulse(2)).toBe("A");
    expect(classFromImpulse(7)).toBe("C");
    expect(classFromImpulse(15)).toBe("D");
    expect(classFromImpulse(100)).toBe("G");
    expect(classFromImpulse(200)).toBe("H");
    expect(classFromImpulse(500)).toBe("I");
    expect(classFromImpulse(1000)).toBe("J");
    expect(classFromImpulse(2000)).toBe("K");
  });
  it("Estes kataloğu doğrulanmış değerler içerir", () => {
    const c6 = ESTES_MOTORS.find((m) => m.id === "C6-7");
    expect(c6).toBeDefined();
    expect(c6!.totalImpulse).toBeGreaterThanOrEqual(8.0);
    expect(c6!.totalImpulse).toBeLessThanOrEqual(10.5);
    expect(c6!.burnTime).toBeGreaterThanOrEqual(1.5);
    expect(c6!.delay).toBe(7);
    const d12 = ESTES_MOTORS.find((m) => m.id === "D12-5");
    expect(d12!.totalImpulse).toBeGreaterThanOrEqual(15);
    expect(d12!.delay).toBe(5);
  });
});

describe("İtki eğrileri", () => {
  it("toplam itki korunur (integral)", () => {
    const curve = generateThrustCurve({ totalImpulse: 8.8, burnTime: 1.9, grain: "endBurn" });
    const integral = curveTotalImpulse(curve);
    expect(integral).toBeCloseTo(8.8, 1);
  });
  it("BATES progresif, end-burn nötr", () => {
    const b = generateThrustCurve({ totalImpulse: 100, burnTime: 2, grain: "bates" });
    const e = generateThrustCurve({ totalImpulse: 100, burnTime: 2, grain: "endBurn" });
    // Tail-off (~%94) öncesi noktalar: progresif eğri yanma sonuna doğru artar
    const earlyB = b[Math.floor(b.length * 0.3)].F;
    const lateB = b[Math.floor(b.length * 0.7)].F;
    const earlyE = e[Math.floor(e.length * 0.2)].F;
    const lateE = e[Math.floor(e.length * 0.7)].F;
    expect(lateB).toBeGreaterThan(earlyB); // progresif artış
    expect(Math.abs(lateE - earlyE)).toBeLessThan(earlyE * 0.15); // nötr + sönüm
  });
});

describe("Barrowman", () => {
  it("koni CP'si 2/3 uzunlukta", () => {
    const n = barrowmanNose(0.666, 0.05);
    expect(n.x).toBeCloseTo(0.0333, 3);
    expect(n.cn).toBe(2);
  });
  it("kanat CP'si kök kiriş önüne göre geride", () => {
    const fin = barrowmanFins({
      rootChord: 0.08, tipChord: 0.06, semispan: 0.045, sweep: 0, count: 3,
      bodyRadius: 0.01245, xRoot: 0.2,
    });
    expect(fin.x).toBeGreaterThan(0.2);
    expect(fin.cn).toBeGreaterThan(1);
  });
  it("kanat sayısı arttıkça CNα artar", () => {
    const f3 = barrowmanFins({ rootChord: 0.08, tipChord: 0.06, semispan: 0.045, sweep: 0, count: 3, bodyRadius: 0.01245, xRoot: 0.2 });
    const f4 = barrowmanFins({ rootChord: 0.08, tipChord: 0.06, semispan: 0.045, sweep: 0, count: 4, bodyRadius: 0.01245, xRoot: 0.2 });
    expect(f4.cn).toBeGreaterThan(f3.cn);
  });
});

describe("Montaj ve stabilite", () => {
  it("Alpha: CG, CP ve stabilite mantıklı", () => {
    const a = assembleRocket(alphaConfig());
    expect(a.cgM).toBeGreaterThan(0.1);
    expect(a.cpM).toBeGreaterThan(a.cgM);
    expect(a.stabilityCal).toBeGreaterThan(1.0);
  });
  it("kanatsız roket stabil değildir", () => {
    const cfg = alphaConfig();
    cfg.stages[0].fins.count = 0;
    const a = assembleRocket(cfg);
    expect(a.stabilityCal).toBeLessThan(1.0);
  });
  it("boyut değişince kütle değişir", () => {
    const c1 = alphaConfig();
    const a1 = assembleRocket(c1);
    const c2 = alphaConfig();
    c2.stages[0].body.lengthM = 0.5;
    const a2 = assembleRocket(c2);
    expect(a2.liftoffMassKg).toBeGreaterThan(a1.liftoffMassKg);
  });
});

describe("Kabul testi 1: Alpha + C6-7 → 150-220 m", () => {
  it("apogee 150-220 m aralığında", () => {
    const cfg = alphaConfig();
    const a = assembleRocket(cfg);
    const result = simulateFlight({ assembly: a, throttle: 1, prediction: true });
    expect(result.maxAltM).toBeGreaterThanOrEqual(150);
    expect(result.maxAltM).toBeLessThanOrEqual(220);
  });
  it("D12-5 ile daha yüksek uçar", () => {
    const cfg = alphaConfig();
    cfg.stages[0].motor.choice = { kind: "estes", id: "D12-5", count: 1 };
    const a = assembleRocket(cfg);
    const result = simulateFlight({ assembly: a, throttle: 1, prediction: true });
    expect(result.maxAltM).toBeGreaterThan(220);
    expect(result.maxAltM).toBeLessThanOrEqual(420);
  });
});

describe("Kabul testi 2: Vakum + Tsiolkovsky ±%1", () => {
  it("delta-v eşleşmesi", () => {
    const cfg = alphaConfig();
    cfg.windMps = 0;
    const a = assembleRocket(cfg);
    const m0 = a.liftoffMassKg;
    const isp = 82;
    const c6 = ESTES_MOTORS.find((m) => m.id === "C6-7")!;
    // Simülasyonda kütle azalması itki eğrisinden gelir: mProp = I_tot/(Isp·g0)
    const mProp = c6.totalImpulse / (isp * 9.80665);
    // Tsiolkovsky: Δv = Isp·g0·ln(m0/mf) — itki eğrisi şeklinden bağımsız
    const dvTheory = isp * 9.80665 * Math.log(m0 / (m0 - mProp));
    // Vakum simülasyonu (sürtünme ve rüzgar yok)
    const result = simulateFlight({ assembly: a, throttle: 1, vacuum: true, prediction: true });
    // Simülasyonda max hız sönüm anında: dv_sim + g·t_burn ≈ dv_theory (yerçekimi kaybı)
    const dvSim = result.maxVelMps + 9.80665 * c6.burnTime;
    expect(Math.abs(dvSim - dvTheory) / dvTheory).toBeLessThan(0.01);
  });
});

describe("Kısma (throttle)", () => {
  /** Sıvı yakıtlı, kısılabilir tek kademe. */
  function throttledConfig(throttle: number): RocketConfig {
    const cfg = alphaConfig();
    cfg.stages[0].motor = {
      choice: { kind: "liquid", fuel: "LOX/RP-1", name: "T", thrustN: 12, propMassKg: 0.15, dryFraction: 0.1, count: 1 },
      throttle,
    };
    cfg.windMps = 0;
    return cfg;
  }

  it("0.5 kısma yanma süresini 2 katına çıkarır", () => {
    const full = simulateFlight({ assembly: assembleRocket(throttledConfig(1)), throttle: 1, prediction: true });
    const throttled = simulateFlight({ assembly: assembleRocket(throttledConfig(0.5)), throttle: 1, prediction: true });
    const boFull = full.events.find((e) => e.id === "burnout");
    const boHalf = throttled.events.find((e) => e.id === "burnout");
    expect(boFull).toBeDefined();
    expect(boHalf).toBeDefined();
    expect(boHalf!.t).toBeCloseTo(boFull!.t * 2, 0);
  });

  it("kısma toplam itkiyi korur (sönüm sonrası hız eşit)", () => {
    const full = simulateFlight({ assembly: assembleRocket(throttledConfig(1)), throttle: 1, prediction: true, vacuum: true });
    const throttled = simulateFlight({ assembly: assembleRocket(throttledConfig(0.5)), throttle: 1, prediction: true, vacuum: true });
    // Vakumda, yerçekimi kaybı ihmal edilebilirse sönüm anındaki hız aynı olmalı (aynı I_tot, aynı kütle)
    const vFull = full.events.find((e) => e.id === "burnout");
    const vHalf = throttled.events.find((e) => e.id === "burnout");
    const velFull = full.telemetry.find((s) => s.t >= (vFull?.t ?? 0))?.velMps ?? 0;
    const velHalf = throttled.telemetry.find((s) => s.t >= (vHalf?.t ?? 0))?.velMps ?? 0;
    expect(Math.abs(velHalf - velFull) / Math.max(velFull, 1)).toBeLessThan(0.25);
  });
});
