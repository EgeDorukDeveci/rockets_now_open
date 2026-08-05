import { describe, expect, it } from "vitest";
import { defaultTechRocket, type TechRocket } from "../model";
import { assembleTech } from "./assembly";
import { analyzeBarrowman } from "./barrowman";

const alpha = () => defaultTechRocket();

function withFinHeight(r: TechRocket, h: number): TechRocket {
  const st = r.stages[0];
  return {
    ...r,
    stages: [{
      ...st,
      components: st.components.map((c) =>
        c.kind === "trapezoidfin" ? { ...c, heightM: h } : c
      ),
    }],
  };
}

function withoutFins(r: TechRocket): TechRocket {
  const st = r.stages[0];
  return {
    ...r,
    stages: [{ ...st, components: st.components.filter((c) => c.kind !== "trapezoidfin") }],
  };
}

describe("tech barrowman", () => {
  it("Alpha: CP stabilite bölgesinde ve stabilite ≥ 1 kalibre", () => {
    const b = analyzeBarrowman(alpha());
    const a = assembleTech(alpha());
    expect(b.cp).toBeGreaterThan(a.cg);
    expect(b.cp).toBeGreaterThan(0.15);
    expect(b.cp).toBeLessThan(a.totalLength);
    expect((b.cp - a.cg) / a.referenceDiameter).toBeGreaterThanOrEqual(1);
  });

  it("burun konisi CN ≈ 2 ve CP koni tabanının gerisinde değil", () => {
    const b = analyzeBarrowman(alpha());
    const nose = b.parts.find((p) => p.kind === "nosecone");
    expect(nose).toBeTruthy();
    expect(nose!.cn).toBeCloseTo(2, 6);
    expect(nose!.cpM).toBeGreaterThan(0);
    expect(nose!.cpM).toBeLessThan(0.075);
  });

  it("kanat seti en büyük CN katkısını yapar", () => {
    const b = analyzeBarrowman(alpha());
    const fin = b.parts.find((p) => p.kind === "trapezoidfin")!;
    const nose = b.parts.find((p) => p.kind === "nosecone")!;
    expect(fin.cn).toBeGreaterThan(nose.cn);
  });

  it("kanatsız roketin CP'si buruna yakın kalır", () => {
    const b = analyzeBarrowman(withoutFins(alpha()));
    expect(b.cp).toBeLessThan(0.30);
    expect(b.cnTotal).toBeLessThan(2.5);
  });

  it("kanat büyütünce CP geriye kayar", () => {
    const small = analyzeBarrowman(alpha());
    const big = analyzeBarrowman(withFinHeight(alpha(), 0.09));
    expect(big.cp).toBeGreaterThan(small.cp);
  });

  it("bileşen listesi adlandırılmış parçaları içerir", () => {
    const b = analyzeBarrowman(alpha());
    expect(b.parts.length).toBeGreaterThanOrEqual(2);
    for (const p of b.parts) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.cn).toBeGreaterThanOrEqual(0);
    }
  });
});