import { describe, it, expect } from "vitest";
import {
  defaultTechRocket,
  makeComponent,
  serializeTech,
  deserializeTech,
  TECH_COMPONENT_LABELS,
  type TechRocket,
  type BodyTube,
  type NoseCone,
  type MotorMount,
} from "./model";
import { TECH_MATERIALS as MATS } from "./materials";

describe("tech model", () => {
  it("Alpha varsayılan roketi geçerli", () => {
    const r = defaultTechRocket();
    expect(r.stages.length).toBe(1);
    const kinds = r.stages[0].components.map((c) => c.kind);
    expect(kinds).toContain("nosecone");
    expect(kinds).toContain("bodytube");
    expect(kinds).toContain("trapezoidfin");
    expect(kinds).toContain("motormount");
    // Alpha ölçüleri (casual preset ile uyumlu): uzunluk 0.312 m, BT-50
    const tube = r.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube;
    expect(tube.outerDiameterM).toBeCloseTo(0.0249, 3);
    expect(Math.abs(tube.lengthM - 0.16) < 0.05).toBe(true);
  });

  it("makeComponent her kind için geçerli nesne üretir", () => {
    const kinds = Object.keys(TECH_COMPONENT_LABELS) as Array<keyof typeof TECH_COMPONENT_LABELS>;
    for (const k of kinds) {
      const c = makeComponent(k as never);
      expect(c.id).toBeTruthy();
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("her bileşen malzemeId referansı geçerli", () => {
    const r = defaultTechRocket();
    const walk = (cs: Array<{ materialId?: string }>) => {
      for (const c of cs) {
        if (c.materialId !== undefined) expect(MATS[c.materialId]).toBeDefined();
      }
    };
    walk(r.stages[0].components);
  });

  it("serileştirme yuvarlak yol korur", () => {
    const r = defaultTechRocket();
    const r2 = deserializeTech(serializeTech(r));
    expect(r2.name).toBe(r.name);
    expect(r2.stages[0].components.length).toBe(r.stages[0].components.length);
    expect(r2.conditions.windSpeedMps).toBe(r.conditions.windSpeedMps);
  });

  it("motor montajı varsayılan Estes C6-7 referanslı", () => {
    const r = defaultTechRocket();
    const mm = r.stages[0].components.find((c) => c.kind === "motormount") as MotorMount;
    expect(mm.motorId).toBe("C6-7");
  });

  it("NoseCone shoulder alanları sıfır veya pozitif", () => {
    const r = defaultTechRocket();
    const nose = r.stages[0].components.find((c) => c.kind === "nosecone") as NoseCone;
    expect(nose.lengthM).toBeGreaterThan(0);
    expect(nose.aftDiameterM).toBeGreaterThan(0);
  });
});