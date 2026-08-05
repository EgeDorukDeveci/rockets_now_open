import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeNoseLatheProfile, stackPineCanopies, followDistance, isStageVisible, rocketUpVector, swingUp } from "./geometry";

describe("3D geometry alignment", () => {
  it("builds the nose with its base on y=0 and tip toward +Y", () => {
    const length = 0.05;
    const radius = 0.0125;
    const points = makeNoseLatheProfile("tangentOgive", length, radius, 0.5, 0.1);

    expect(points[0].x).toBeCloseTo(radius, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
    expect(points.at(-1)?.x).toBeCloseTo(0, 6);
    expect(points.at(-1)?.y).toBeCloseTo(length, 6);
  });

  it("keeps every pine canopy tier touching the previous part", () => {
    const layout = stackPineCanopies(1.3, [1.1, 0.82, 0.58], 0.06);
    const trunkTop = layout.trunkHeight;

    expect(layout.trunkCenterY - layout.trunkHeight / 2).toBeCloseTo(0, 6);
    expect(layout.tiers[0].bottom).toBeLessThanOrEqual(trunkTop);

    for (let i = 1; i < layout.tiers.length; i++) {
      expect(layout.tiers[i].bottom).toBeLessThanOrEqual(layout.tiers[i - 1].top);
    }
  });

  it("keeps the rocket readable on screen at any flight altitude", () => {
    for (const height of [0.31, 0.45, 1.1, 2.5]) {
      const d = followDistance(height, 1);
      const apparentDeg = (2 * Math.atan2(height / 2, d) * 180) / Math.PI;
      expect(apparentDeg).toBeGreaterThan(2);
    }
    expect(followDistance(10, 1)).toBeLessThanOrEqual(80);
    expect(followDistance(0.45, 2)).toBeCloseTo(followDistance(0.45, 1) * 2, 6);
  });

  it("keeps the flying vehicle visible after each stage separation", () => {
    expect(isStageVisible(0, 1, 0)).toBe(true);

    for (let i = 0; i < 3; i++) expect(isStageVisible(i, 3, 0)).toBe(true);

    expect(isStageVisible(0, 2, 1)).toBe(true);
    expect(isStageVisible(1, 2, 1)).toBe(false);

    expect(isStageVisible(0, 3, 1)).toBe(true);
    expect(isStageVisible(1, 3, 1)).toBe(true);
    expect(isStageVisible(2, 3, 1)).toBe(false);

    expect(isStageVisible(0, 3, 2)).toBe(true);
    expect(isStageVisible(1, 3, 2)).toBe(false);
    expect(isStageVisible(2, 3, 2)).toBe(false);
  });

  it("hangs the rocket nose-up under the parachute", () => {
    const chute = rocketUpVector([0, -3.6, 0], true);
    expect(chute.y).toBeCloseTo(1, 6);
    const drifted = rocketUpVector([0.4, -3.6, 0.2], true);
    expect(drifted.x).toBeCloseTo(0, 6);
    expect(drifted.y).toBeCloseTo(1, 6);
    const ballistic = rocketUpVector([0, -20, 0], false);
    expect(ballistic.y).toBeCloseTo(-1, 6);
    const climb = rocketUpVector([0, 20, 0], false);
    expect(climb.y).toBeCloseTo(1, 6);
    const idle = rocketUpVector([0, 0, 0], false);
    expect(idle.y).toBeCloseTo(1, 6);
  });

  it("swings the rocket up with a damped pendulum instead of snapping", () => {
    const target = new THREE.Vector3(0, 1, 0);

    let up = new THREE.Vector3(0, -1, 0);
    let speed = 0;
    for (let i = 0; i < 5; i++) speed = swingUp(up, speed, target, 13, 1.6, 0.016);
    expect(up.y).toBeGreaterThan(-1);
    expect(up.y).toBeLessThan(1);

    up = new THREE.Vector3(0.2, -1, 0.1).normalize();
    speed = 0;
    for (let i = 0; i < 900; i++) speed = swingUp(up, speed, target, 13, 1.6, 0.016);
    expect(up.distanceTo(target)).toBeLessThan(1e-3);

    const stable = new THREE.Vector3(0, 1, 0);
    const s2 = swingUp(stable, 0, target, 13, 1.6, 0.016);
    expect(s2).toBeCloseTo(0, 9);
    expect(stable.distanceTo(target)).toBeLessThan(1e-9);
  });
});
