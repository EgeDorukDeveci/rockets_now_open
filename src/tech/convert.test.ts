import { describe, it, expect } from "vitest";
import { casualToTech, techToCasual } from "./convert";
import { defaultConfig } from "../types";
import { PRESETS } from "../presets";
import { assembleTech } from "./physics/assembly";
import { simulate } from "./physics/simulator";
import { BodyTube, MotorMount, NoseCone, Parachute, TrapezoidFinSet } from "./model";

function alphaCasual() {
  return PRESETS.find((p) => p.id === "alpha")!.build();
}

describe("casual -> tech dönüşümü", () => {
  it("Alpha presetini birebir taşır (uzunluk 0.31±0.02, BT-50, C6-7)", () => {
    const t = casualToTech(alphaCasual());
    const st = t.stages[0];
    const nose = st.components.find((c) => c.kind === "nosecone") as NoseCone;
    const tube = st.components.find((c) => c.kind === "bodytube") as BodyTube;
    const fin = st.components.find((c) => c.kind === "trapezoidfin") as TrapezoidFinSet;
    const mount = tube.children.find((c) => c.kind === "motormount") as MotorMount;
    const chute = tube.children.find((c) => c.kind === "parachute") as Parachute;

    expect(nose.shape).toBe("ogive");
    expect(nose.lengthM).toBeCloseTo(2 * 0.0249, 6);
    expect(nose.aftDiameterM).toBe(0.0249);
    expect(tube.lengthM).toBe(0.262);
    expect(tube.outerDiameterM).toBe(0.0249);
    expect(tube.materialId).toBe("cardboard");
    expect(fin.finCount).toBe(3);
    expect(fin.rootChordM).toBe(0.08);
    expect(fin.tipChordM).toBe(0.06);
    expect(fin.heightM).toBe(0.045);
    expect(mount.motorId).toBe("C6-7");
    expect(chute.diameterM).toBe(0.3);
    expect(chute.deployEvent).toBe("ejection");
    expect(t.conditions.launchRodLengthM).toBe(1.2);
    expect(t.conditions.windSpeedMps).toBe(2);
    expect(t.conditions.timestepS).toBe(0.01);
    expect(t.name).toBe("Estes Alpha");
  });

  it("montaj uzunluğu casual kalibrasyonla eşleşir (~0.3118 m)", () => {
    const t = casualToTech(alphaCasual());
    const asm = assembleTech(t);
    expect(asm.totalLength).toBeCloseTo(0.3118, 3);
  });

  it("Alpha dönüşümü simüle edilebilir (apogee 150-250 m)", () => {
    const t = casualToTech(alphaCasual());
    const res = simulate(t);
    expect(res.summary.apogeeM).toBeGreaterThan(150);
    expect(res.summary.apogeeM).toBeLessThan(250);
  });

  it("çok kademeli + güçlendirici taşır", () => {
    const cfg = defaultConfig();
    cfg.stages.push(defaultConfig().stages[0]);
    cfg.boosterCount = 2;
    const t = casualToTech(cfg);
    expect(t.stages.length).toBe(2);
    expect(t.parallelStages.length).toBe(1);
    expect(t.parallelStages[0].instanceCount).toBe(2);
    expect(t.stages[1].separationEvent).toBe("ejection");
  });

  it("kurtarma varyantlarını taşır (apogee/timer, streamer, none)", () => {
    const base = alphaCasual();
    base.stages[0].recovery.trigger = "apogee";
    const t1 = casualToTech(base);
    const chute1 = (t1.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube)
      .children.find((c) => c.kind === "parachute") as Parachute;
    expect(chute1.deployEvent).toBe("apogee");

    base.stages[0].recovery.type = "streamer";
    const t2 = casualToTech(base);
    const tube2 = t2.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube;
    expect(tube2.children.some((c) => c.kind === "streamer")).toBe(true);

    base.stages[0].recovery.type = "none";
    const t3 = casualToTech(base);
    const tube3 = t3.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube;
    expect(tube3.children.some((c) => c.kind === "parachute" || c.kind === "streamer")).toBe(false);
  });
});

describe("tech -> casual geri dönüş", () => {
  it("Alpha anahtar değerleri korur", () => {
    const back = techToCasual(casualToTech(alphaCasual()));
    expect(back.name).toBe("Estes Alpha");
    const s = back.stages[0];
    expect(s.body.lengthM).toBe(0.262);
    expect(s.body.diameterM).toBe(0.0249);
    expect(s.nose.profile).toBe("tangentOgive");
    expect(s.nose.lengthCalibers).toBeCloseTo(2, 6);
    expect(s.fins.count).toBe(3);
    expect(s.fins.rootChordM).toBe(0.08);
    expect(s.motor.choice).toEqual({ kind: "estes", id: "C6-7", count: 1 });
    expect(s.recovery.type).toBe("parachute");
    expect(s.recovery.diameterM).toBe(0.3);
    expect(s.recovery.shockCordM).toBe(0.8);
    expect(back.windMps).toBe(2);
    expect(back.railM).toBe(1.2);
  });
});
