import { describe, it } from "vitest";
import { casualToTech } from "../tech/convert";
import { assembleTech } from "../tech/physics/assembly";
import { simulate } from "../tech/physics/simulator";
import { PRESETS } from "../presets";

describe("bisect", () => {
  it("preset block with/without", () => {
    const cfg = PRESETS.find((p) => p.id === "alpha")!.build();
    const t = casualToTech(cfg);
    const withBlock = simulate(t);
    console.log("PRESET+BLOCK", "apogee", withBlock.summary.apogeeM.toFixed(1), "landing", withBlock.summary.landingMps.toFixed(2));
    const a = assembleTech(t);
    console.log("ASM", "mass", a.liftoffMass.toFixed(4), "stab", a.stability.toFixed(2), "cg", a.cg.toFixed(4), "cp", a.cp.toFixed(4), "l", a.totalLength.toFixed(4));
    const stage = t.stages[0];
    const noBlock = { ...t, stages: [{ ...stage, components: stage.components.filter((c) => c.kind !== "engineblock") }] };
    const without = simulate(noBlock);
    console.log("PRESET-NOBLOCK", "apogee", without.summary.apogeeM.toFixed(1), "landing", without.summary.landingMps.toFixed(2));
  });
});