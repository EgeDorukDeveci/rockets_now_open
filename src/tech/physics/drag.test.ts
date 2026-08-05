import { describe, expect, it } from "vitest";
import { defaultTechRocket, type TechRocket } from "../model";
import { cdAtMach, cdMachTable } from "./drag";

const alpha = () => defaultTechRocket();

function withFinish(r: TechRocket, finish: "normal" | "smooth" | "rough" | "polished"): TechRocket {
  const st = r.stages[0];
  return {
    ...r,
    stages: [{
      ...st,
      components: st.components.map((c) => ({ ...c, finish })),
    }],
  };
}

describe("tech drag", () => {
  it("Alpha: subsonik Cd 0.25–0.6", () => {
    const d = cdAtMach(alpha(), 0);
    expect(d.cdTotal).toBeGreaterThan(0.25);
    expect(d.cdTotal).toBeLessThan(0.6);
  });

  it("transonik tepe ≥ 1.5× subsonik Cd", () => {
    const table = cdMachTable(alpha(), 3, 0.1);
    const sub = cdAtMach(alpha(), 0).cdTotal;
    const peak = Math.max(...table.map((r) => r.cdTotal));
    expect(peak).toBeGreaterThanOrEqual(sub * 1.5);
    const peakRow = table.find((r) => r.cdTotal === peak)!;
    expect(peakRow.mach).toBeGreaterThanOrEqual(0.8);
    expect(peakRow.mach).toBeLessThanOrEqual(1.3);
  });

  it("supersonik Cd tepe sonrası düşer", () => {
    const d2 = cdAtMach(alpha(), 2).cdTotal;
    const d3 = cdAtMach(alpha(), 3).cdTotal;
    const peak = Math.max(...cdMachTable(alpha(), 3, 0.1).map((r) => r.cdTotal));
    expect(d2).toBeLessThan(peak);
    expect(d3).toBeLessThan(d2);
  });

  it("bileşen dökümü ana parçaları içerir", () => {
    const d = cdAtMach(alpha(), 0);
    const kinds = d.parts.map((p) => p.kind);
    expect(kinds).toContain("nosecone");
    expect(kinds).toContain("bodytube");
    expect(kinds).toContain("trapezoidfin");
    expect(Math.abs(d.parts.reduce((s, p) => s + p.cd, 0) - d.cdTotal)).toBeLessThan(0.02);
  });

  it("pürüzlü yüzey Cd'yi artırır", () => {
    const normal = cdAtMach(alpha(), 0).cdTotal;
    const rough = cdAtMach(withFinish(alpha(), "rough"), 0).cdTotal;
    const polished = cdAtMach(withFinish(alpha(), "polished"), 0).cdTotal;
    expect(rough).toBeGreaterThan(normal);
    expect(polished).toBeLessThan(normal);
  });

  it("cdMachTable 0.1 adımıyla tam liste üretir", () => {
    const table = cdMachTable(alpha(), 3, 0.1);
    expect(table.length).toBe(31);
    expect(table[0].mach).toBeCloseTo(0, 6);
    expect(table[30].mach).toBeCloseTo(3, 6);
  });
});