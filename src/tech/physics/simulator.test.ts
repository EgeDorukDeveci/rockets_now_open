import { describe, expect, it } from "vitest";
import { defaultTechRocket } from "../model";
import { assembleTech, motorSpecsFromCatalog } from "./assembly";
import { simulate, simulateVacuum } from "./simulator";

const alpha = () => {
  const r = defaultTechRocket();
  r.conditions.windSpeedMps = 0;
  r.conditions.windModel = "average";
  return r;
};

describe("tech simulator", () => {
  it("Alpha: apogee 150–250 m (C6-7, ray 1.2 m, rüzgarsız)", () => {
    const res = simulate(alpha());
    expect(res.summary.apogeeM).toBeGreaterThan(150);
    expect(res.summary.apogeeM).toBeLessThan(250);
  });

  it("raydan çıkış hızı ≥ 15 m/s ve erken zaman", () => {
    const res = simulate(alpha());
    expect(res.summary.railExitMps).toBeGreaterThanOrEqual(15);
    expect(res.summary.railExitTimeS).toBeLessThan(0.7);
  });

  it("max hız 80 m/s üzeri", () => {
    const res = simulate(alpha());
    expect(res.summary.maxVelMps).toBeGreaterThan(80);
  });

  it("vakum modu: Tsiolkovsky ±%1", () => {
    const r = alpha();
    const dv = simulateVacuum(r);
    const isp = 82;
    const a = assembleTech(r);
    const m0 = a.liftoffMass;
    // Simülasyonda kütle azalması itki eğrisinden gelir: mProp = I_tot/(Isp·g0)
    // (casual physics.test.ts ile aynı yöntem).
    const mProp = motorSpecsFromCatalog("C6-7")!.totalImpulse / (isp * 9.80665);
    const mf = m0 - mProp;
    const dvTheory = isp * 9.80665 * Math.log(m0 / mf);
    // Yerçekimi kaybı telafisi (casual physics.test.ts ile aynı yöntem):
    // dv_sim + g·t_burn ≈ dv_theory
    const burnTime = motorSpecsFromCatalog("C6-7")!.burnTime;
    const dvSim = dv + 9.80665 * burnTime;
    expect(Math.abs(dvSim - dvTheory) / dvTheory).toBeLessThan(0.01);
  });

  it("rüzgar sürüklenmeyi artırır", () => {
    const calm = simulate(alpha());
    const windy = alpha();
    windy.conditions.windSpeedMps = 5;
    const res = simulate(windy);
    expect(res.summary.driftM).toBeGreaterThan(calm.summary.driftM + 10);
  });

  it("paraşüt açılır ve iniş hızı sınırlı kalır", () => {
    const res = simulate(alpha());
    expect(res.samples.some((s) => s.deployed)).toBe(true);
    expect(res.summary.landingMps).toBeLessThan(12);
  });

  it("uçuş zamanı sınırlı ve inişle biter", () => {
    const res = simulate(alpha());
    expect(res.summary.flightTimeS).toBeGreaterThan(20);
    expect(res.summary.flightTimeS).toBeLessThan(200);
    const last = res.samples[res.samples.length - 1];
    expect(last.z).toBeLessThanOrEqual(0.01);
  });
});