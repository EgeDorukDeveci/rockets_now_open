import { describe, expect, it } from "vitest";
import { defaultTechRocket } from "../model";
import {
  assembleTech,
  motorSpecsFromCatalog,
  placeRocket,
  clearMotors,
} from "./assembly";

const alpha = () => defaultTechRocket();

describe("tech assembly", () => {
  it("Alpha: uzunluk 0.29–0.33 m", () => {
    const a = assembleTech(alpha());
    expect(a.totalLength).toBeGreaterThan(0.29);
    expect(a.totalLength).toBeLessThan(0.33);
  });

  it("Alpha: referans çapı BT-50 → Ø24.9 mm", () => {
    const a = assembleTech(alpha());
    expect(a.referenceDiameter).toBeCloseTo(0.0249, 4);
  });

  it("Alpha: yapı kütlesi 15–30 g (motorsuz)", () => {
    const a = assembleTech(alpha());
    expect(a.structureMass).toBeGreaterThan(0.015);
    expect(a.structureMass).toBeLessThan(0.030);
  });

  it("Alpha: kalkış kütlesi 40–60 g (C6-7 dahil)", () => {
    const a = assembleTech(alpha());
    expect(a.liftoffMass).toBeGreaterThan(0.040);
    expect(a.liftoffMass).toBeLessThan(0.060);
  });

  it("Alpha: itici kütlesi 8–14 g", () => {
    const a = assembleTech(alpha());
    expect(a.propellantMass).toBeGreaterThan(0.008);
    expect(a.propellantMass).toBeLessThan(0.014);
  });

  it("motorSpecsFromCatalog: C6-7 → 8.8 N·s / 1.9 s / 24.2 g / 10.8 g", () => {
    const m = motorSpecsFromCatalog("C6-7");
    expect(m !== null).toBe(true);
    expect(m!.totalImpulse).toBeCloseTo(8.8, 1);
    expect(m!.burnTime).toBeCloseTo(1.9, 1);
    expect(m!.mass).toBeCloseTo(0.0242, 4);
    expect(m!.propellant).toBeCloseTo(0.0108, 4);
  });

  it("Alpha: benzer yabancı — CP, CG'nin arkasında ve stabilite ≥ 1 cal", () => {
    const a = assembleTech(alpha());
    expect(a.cp).toBeGreaterThan(a.cg);
    expect((a.cp - a.cg) / a.referenceDiameter).toBeGreaterThanOrEqual(1);
  });

  it("motor çıkarınca CG öne kayar", () => {
    const withM = assembleTech(alpha());
    const bare = alpha();
    clearMotors(bare);
    const noM = assembleTech(bare);
    expect(noM.cg).toBeLessThan(withM.cg);
  });

  it("placeRocket: tüp son kanat, naz önce; son Parça sıralı artış", () => {
    const p = placeRocket(alpha());
    const nose = p.find((c) => c.kind === "nosecone");
    const tube = p.find((c) => c.kind === "bodytube");
    const fin = p.find((c) => c.kind === "trapezoidfin");
    expect(nose && tube && fin).toBeTruthy();
    expect(nose!.x).toBeLessThan(tube!.x);
    expect(fin!.x).toBeGreaterThan(tube!.x);
  });
});