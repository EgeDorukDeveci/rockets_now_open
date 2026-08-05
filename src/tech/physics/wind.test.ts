import { describe, expect, it } from "vitest";
import { defaultTechConditions } from "../model";
import { windAt, windVectorAt } from "./wind";

describe("tech wind", () => {
  it("ortalama model: her yükseklikte sabit hız", () => {
    const c = defaultTechConditions();
    c.windModel = "average";
    c.windSpeedMps = 4;
    expect(windAt(0, c)).toBeCloseTo(4, 9);
    expect(windAt(300, c)).toBeCloseTo(4, 9);
    expect(windAt(1200, c)).toBeCloseTo(4, 9);
  });

  it("çok seviyeli model: seviye noktasında seviye değerini döndürür", () => {
    const c = defaultTechConditions();
    c.windModel = "multilevel";
    const lv = windAt(100, c);
    expect(lv).toBeCloseTo(3, 9);
    expect(windAt(500, c)).toBeCloseTo(5, 9);
  });

  it("çok seviyeli model: seviyeler arasında doğrusal alır", () => {
    const c = defaultTechConditions();
    c.windModel = "multilevel";
    const mid = windAt(50, c);
    expect(mid).toBeCloseTo(2.5, 9);
  });

  it("çok seviyeli model: aralık dışında uç değeri korur", () => {
    const c = defaultTechConditions();
    c.windModel = "multilevel";
    expect(windAt(0, c)).toBeCloseTo(2, 9);
    expect(windAt(2000, c)).toBeCloseTo(5, 9);
  });

  it("yön vektörü hız ve yönü doğru ayrıştırır", () => {
    const c = defaultTechConditions();
    c.windModel = "average";
    c.windSpeedMps = 3;
    c.windDirectionDeg = 0; // kuzey (y ekseni)
    const v = windVectorAt(0, c);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(3, 6);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(3, 6);
  });

  it("model: average<double windSpeed değişimi vektöre yansır", () => {
    const c = defaultTechConditions();
    c.windModel = "average";
    c.windSpeedMps = 0;
    const v = windVectorAt(10, c);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(0, 9);
  });
});