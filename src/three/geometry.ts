import * as THREE from "three";
import { makeProfile, NoseProfileId } from "../physics/noseShapes";

export interface PineCanopyTier {
  centerY: number;
  height: number;
  bottom: number;
  top: number;
}

export interface PineLayout {
  trunkCenterY: number;
  trunkHeight: number;
  tiers: PineCanopyTier[];
}

/**
 * World direction of the rocket's +Y (nose) axis. Without a parachute the
 * rocket aligns with its velocity (ballistic fall / climb). Once the chute is
 * out it hangs nose-up like a real model rocket — the canopy is packed in the
 * nose and the vehicle dangles from it, regardless of descent direction.
 */
export function rocketUpVector(velocity: [number, number, number], chuteDeployed: boolean): THREE.Vector3 {
  if (chuteDeployed) return new THREE.Vector3(0, 1, 0);
  const sp = Math.hypot(velocity[0], velocity[1], velocity[2]);
  if (sp < 0.5) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(velocity[0], velocity[1], velocity[2]).normalize();
}

/**
 * Integrates one step of a damped pendulum: rotates `current` (mutated in
 * place) toward `target` with an angular spring and velocity damping, so a
 * chute-deployed rocket swings up naturally instead of snapping vertical.
 * Returns the new angular speed (rad/s) around the rotation axis.
 */
export function swingUp(
  current: THREE.Vector3,
  angularSpeed: number,
  target: THREE.Vector3,
  springK: number,
  damping: number,
  dt: number
): number {
  let axis = new THREE.Vector3().crossVectors(current, target);
  let len = axis.length();
  let angle: number;
  if (len < 1e-9) {
    if (current.dot(target) > 0) return angularSpeed;
    const seed = Math.abs(current.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    axis = new THREE.Vector3().crossVectors(current, seed);
    len = axis.length();
    if (len < 1e-9) return angularSpeed;
    axis.divideScalar(len);
    angle = Math.PI;
  } else {
    axis.divideScalar(len);
    const cosA = Math.max(-1, Math.min(1, current.dot(target)));
    const sinA = Math.min(1, len);
    angle = Math.atan2(sinA, cosA);
  }
  const speed = angularSpeed + (springK * angle - damping * angularSpeed) * dt;
  current.applyAxisAngle(axis, speed * dt);
  return speed;
}

/**
 * Whether a stage (0 = top, count-1 = bottom) is still attached after
 * `separations` stage separations. Separated stages fall away from the bottom,
 * so only indices below the cut remain part of the flying vehicle.
 */
export function isStageVisible(stageIndex: number, stageCount: number, separations: number): boolean {
  const k = Math.min(separations, stageCount - 1);
  return stageIndex < stageCount - k;
}

/**
 * Follow-camera distance (m) that keeps the rocket readable on screen at any
 * altitude. Scaled to rocket height instead of altitude: a 0.3 m model at
 * 200 m altitude was landing at ~80 m camera distance — sub-pixel against the
 * sky, while flame and parachute stayed visible.
 */
export function followDistance(rocketHeight: number, zoom: number): number {
  const base = Math.min(80, Math.max(4, 2 + rocketHeight * 16));
  return base * zoom;
}

/**
 * Returns nose points in the scene's rocket convention: base at y=0, tip at
 * +Y. The physics profile is expressed from tip (t=0) to base (t=1), so the
 * profile parameter is intentionally reversed here.
 */
export function makeNoseLatheProfile(
  profileId: NoseProfileId,
  length: number,
  radius: number,
  powerN: number,
  bluntness: number,
  segments = 24
): THREE.Vector2[] {
  const profile = makeProfile(profileId);
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const along = i / segments;
    const profileT = 1 - along;
    const r = profile.profile(profileT, {
      fineness: length / Math.max(radius, 1e-6),
      powerN,
      bluntness,
      secantK: 1.2,
    });
    points.push(new THREE.Vector2(radius * r, along * length));
  }
  return points;
}

/** Places centered cone tiers from the top of a centered cylinder upward. */
export function stackPineCanopies(trunkHeight: number, tierHeights: number[], overlap: number): PineLayout {
  const tiers: PineCanopyTier[] = [];
  let nextBottom = trunkHeight - overlap;
  for (const height of tierHeights) {
    const centerY = nextBottom + height / 2;
    const top = centerY + height / 2;
    tiers.push({ centerY, height, bottom: nextBottom, top });
    nextBottom = top - overlap;
  }
  return { trunkCenterY: trunkHeight / 2, trunkHeight, tiers };
}
