import { describe, it } from "vitest";
import { assembleRocket } from "./rocket";
import { defaultStage } from "../types";
import { simulateFlight } from "./trajectory";

function alphaStage() {
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
  return stage;
}

describe("debug3", () => {
  it("alpha assembly detail", () => {
    const a = assembleRocket({
      name: "Alpha", stages: [alphaStage()], boosterCount: 0,
      boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 1 }, throttle: 1 },
      windMps: 2, windDeg: 0, railM: 1.2, railTiltDeg: 0, dt: 0.01,
    });
    console.log("LEN", a.totalLengthM, "MASS", a.liftoffMassKg, "CG", a.cgM, "CP", a.cpM, "STAB", a.stabilityCal, "TWR", a.twr, "CD", a.cdSubsonic);
    const r = simulateFlight({ assembly: a, throttle: 1, prediction: true });
    console.log("APOGEE_C6", r.maxAltM.toFixed(1), "MAXV", r.maxVelMps.toFixed(1));
    const cfg2: import("../types").RocketConfig = { ...a.config, stages: [{ ...a.config.stages[0], motor: { ...a.config.stages[0].motor, choice: { kind: "estes" as const, id: "D12-5", count: 1 } } }] };
    const b = assembleRocket(cfg2);
    const r2 = simulateFlight({ assembly: b, throttle: 1, prediction: true });
    console.log("APOGEE_D12", r2.maxAltM.toFixed(1), "MASS2", b.liftoffMassKg.toFixed(3));
  });
});
