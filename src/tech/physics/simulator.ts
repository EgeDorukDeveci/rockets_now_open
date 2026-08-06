// 6-DOF RK4 simülatör (kuaterniyon). Atalet çerçevesi ENU (x=doğu, y=kuzey,
// z=yukarı), gövde ekseni +z = burun. Kuvvetler: itki eğrisi, yerçekimi,
// Cd(Mach) sürükleme, Barrowman normal kuvveti + stabilite momenti, rüzgâr
// (wind.ts), rampa kısıtı, paraşüt açılışı.

import { G0 } from "../../physics/constants";
import { generateThrustCurve, thrustAt, ThrustPoint } from "../../physics/motors/curve";
import { cdAtMach } from "./drag";
import { windVectorAt } from "./wind";
import { analyzeBarrowman } from "./barrowman";
import { Parachute, TechConditions, TechRocket } from "../model";
import { assembleTech, motorSpecsFromCatalog } from "./assembly";

export interface TechSimSample {
  t: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  speed: number;
  massKg: number;
  accelG: number;
  alphaDeg: number;
  deployed: boolean;
  onRod: boolean;
}

export interface TechFlightSummary {
  apogeeM: number;
  apogeeTimeS: number;
  maxVelMps: number;
  maxMach: number;
  maxAccelG: number;
  flightTimeS: number;
  landingMps: number;
  driftM: number;
  railExitMps: number;
  railExitTimeS: number;
  deployTimeS: number;
}

export interface TechFlightResult {
  samples: TechSimSample[];
  summary: TechFlightSummary;
}

export interface SimOptions {
  /** Vakum modu: sadece itki (Tsiolkovsky doğrulaması). */
  vacuum?: boolean;
  /** Adım sınırı (sonsuz döngü koruması). */
  maxSteps?: number;
}

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

const A_SOUND = 340.3;
const RHO0 = 1.225;

// Bileşen süperpozisyonu rampa pabucu ekleri, dikişler, lüle tabanı, burun
// omzu ve paketleme gibi tüm ikincil sürüklenmeleri yakalamaz. OpenRocket
// benzeri simülatörlerde de kalibrasyon katsayısı kullanılır (casual
// sokset — rocket/drag.ts DRAG_CALIBRATION = 3.0 ile kalibre edilir).
// Teknik sim bu katsayıyı, casual kalibrasyon (~218 m) hizalı apogee
// hedefi 150–250 m sağlar.
const TECH_DRAG_CALIBRATION = 2.5;

const airDensity = (altM: number): number => RHO0 * Math.exp(-altM / 7600);

function qMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function qConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

function qRot(v: Vec3, q: Quat): Vec3 {
  const r = qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q));
  return [r[1], r[2], r[3]];
}

function qNorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 0 ? q.map((x) => x / n) as Quat : [1, 0, 0, 0];
}

function axisAngleQuat(axis: Vec3, angleRad: number): Quat {
  const s = Math.sin(angleRad / 2);
  return [Math.cos(angleRad / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** Rampa yönü: dikeyden launchRodAngleDeg eğik, launchRodDirectionDeg azimutu. */
function rodDirection(c: TechConditions): Vec3 {
  const tilt = (c.launchRodAngleDeg * Math.PI) / 180;
  const az = (c.launchRodDirectionDeg * Math.PI) / 180;
  return [
    Math.sin(tilt) * Math.sin(az),
    Math.sin(tilt) * Math.cos(az),
    Math.cos(tilt),
  ];
}

function rodQuat(c: TechConditions): Quat {
  const rod = rodDirection(c);
  const z: Vec3 = [0, 0, 1];
  const cross: Vec3 = [
    z[1] * rod[2] - z[2] * rod[1],
    z[2] * rod[0] - z[0] * rod[2],
    z[0] * rod[1] - z[1] * rod[0],
  ];
  const len = Math.hypot(cross[0], cross[1], cross[2]);
  if (len < 1e-9) return [1, 0, 0, 0];
  const tilt = Math.acos(Math.min(1, Math.max(-1, rod[2])));
  return axisAngleQuat([cross[0] / len, cross[1] / len, cross[2] / len], tilt);
}

interface SimCtx {
  rocket: TechRocket;
  cond: TechConditions;
  curve: ThrustPoint[];
  cum: number[];
  totalImpulse: number;
  m0: number;
  propMass: number;
  refArea: number;
  cnTotal: number;
  cpCg: number;
  totalLength: number;
  rodDir: Vec3;
  rodQ: Quat;
  rodLen: number;
  chute: { area: number; cd: number; deployDelayS: number } | null;
  chuteActive: boolean;
  vacuum: boolean;
  dt: number;
}

interface St {
  p: Vec3;
  v: Vec3;
  q: Quat;
  w: Vec3;
}

function cumAt(ctx: SimCtx, t: number): number {
  if (ctx.curve.length === 0) return 0;
  const c = ctx.cum;
  if (t <= 0) return 0;
  if (t >= ctx.curve[ctx.curve.length - 1].t) return ctx.totalImpulse;
  let lo = 0;
  let hi = ctx.curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ctx.curve[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = ctx.curve[lo];
  const b = ctx.curve[hi];
  const f = (t - a.t) / Math.max(b.t - a.t, 1e-9);
  return c[lo] + f * (c[hi] - c[lo]);
}

function deriv(ctx: SimCtx, s: St, t: number): St {
  const bz = qRot([0, 0, 1], s.q);
  const alt = s.p[2];
  const thrust = ctx.vacuum ? thrustAt(ctx.curve, t) : thrustAt(ctx.curve, t);
  const mass = Math.max(ctx.m0 - ctx.propMass * (cumAt(ctx, t) / Math.max(ctx.totalImpulse, 1e-9)), ctx.m0 - ctx.propMass);

  let vr: Vec3 = s.v;
  if (!ctx.vacuum) {
    const w = windVectorAt(alt, ctx.cond);
    vr = [s.v[0] - w.x, s.v[1] - w.y, s.v[2]];
  }
  const speed = Math.hypot(vr[0], vr[1], vr[2]);

  const F: Vec3 = [0, 0, -mass * G0];
  F[0] += thrust * bz[0];
  F[1] += thrust * bz[1];
  F[2] += thrust * bz[2];

  let mom: Vec3 = [0, 0, 0];
  let alphaDeg = 0;
  let inertia = (mass * ctx.totalLength * ctx.totalLength) / 12;

  if (!ctx.vacuum && speed > 1e-6) {
    const rho = airDensity(alt);
    const mach = speed / A_SOUND;
    const cd = cdAtMach(ctx.rocket, mach).cdTotal * TECH_DRAG_CALIBRATION;
    const q = 0.5 * rho * speed * speed;
    const dragMag = q * cd * ctx.refArea;
    F[0] -= (dragMag / speed) * vr[0];
    F[1] -= (dragMag / speed) * vr[1];
    F[2] -= (dragMag / speed) * vr[2];

    const vrBody = qRot(vr, qConj(s.q));
    const lateral = Math.hypot(vrBody[0], vrBody[1]);
    if (lateral > 1e-9) {
      alphaDeg = (Math.atan2(lateral, Math.abs(vrBody[2])) * 180) / Math.PI;
      const nMag = q * ctx.refArea * ctx.cnTotal * Math.sin(alphaDeg * Math.PI / 180);
      const nb: Vec3 = [(nMag * vrBody[0]) / lateral, (nMag * vrBody[1]) / lateral, 0];
      const ni = qRot(nb, s.q);
      F[0] += ni[0];
      F[1] += ni[1];
      F[2] += ni[2];
      mom = [-nb[1] * ctx.cpCg, nb[0] * ctx.cpCg, 0];
      const stiff = (q * ctx.refArea * ctx.cnTotal) * ctx.cpCg;
      const damp = 2 * Math.sqrt(stiff * inertia) * 0.9;
      mom[0] -= damp * s.w[0];
      mom[1] -= damp * s.w[1];
    } else {
      mom = [-0.02 * s.w[0], -0.02 * s.w[1], -0.02 * s.w[2]];
    }
  } else {
    mom = [-0.02 * s.w[0], -0.02 * s.w[1], -0.02 * s.w[2]];
  }

  if (ctx.chute && ctx.chuteActive) {
    const rho = airDensity(alt);
    const q = 0.5 * rho * speed * speed;
    if (speed > 1e-6) {
      const chuteMag = q * ctx.chute.cd * ctx.chute.area;
      F[0] -= (chuteMag / speed) * vr[0];
      F[1] -= (chuteMag / speed) * vr[1];
      F[2] -= (chuteMag / speed) * vr[2];
    }
  }

  const Iz = inertia * 0.05;
  const wdot: Vec3 = [
    mom[0] / inertia - ((Iz - inertia) * s.w[1] * s.w[2]) / inertia,
    mom[1] / inertia - ((inertia - Iz) * s.w[0] * s.w[2]) / inertia,
    mom[2] / Iz - ((inertia - Iz) * s.w[0] * s.w[1]) / Iz,
  ];

  const wq: Quat = [0, s.w[0], s.w[1], s.w[2]];
  const qd = qMul(s.q, wq);
  const accel = [F[0] / mass, F[1] / mass, F[2] / mass] as Vec3;

  return { p: s.v, v: accel, q: qd, w: wdot };
}

function findParachute(r: TechRocket): Parachute | null {
  const walk = (cs: TechRocket["stages"][0]["components"]): Parachute | null => {
    for (const c of cs) {
      if (c.kind === "parachute") return c;
      if (c.kind === "bodytube") {
        const hit = walk(c.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const st of r.stages) {
    const hit = walk(st.components);
    if (hit) return hit;
  }
  return null;
}

function buildCtx(rocket: TechRocket, vacuum: boolean): SimCtx {
  const a = assembleTech(rocket);
  const bar = analyzeBarrowman(rocket);
  const cond = rocket.conditions;

  let curve: ThrustPoint[] = [];
  let cum: number[] = [];
  let totalImpulse = 0;
  let propMass = 0;
  const findMount = (cs: TechRocket["stages"][0]["components"]): string | null => {
    for (const c of cs) {
      if (c.kind === "motormount" && c.motorId) return c.motorId;
      if (c.kind === "bodytube") {
        const hit = findMount(c.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  let motorId: string | null = null;
  for (const st of rocket.stages) {
    motorId = findMount(st.components);
    if (motorId) break;
  }
  if (motorId) {
    const m = motorSpecsFromCatalog(motorId);
    if (m) {
      curve = generateThrustCurve({ totalImpulse: m.totalImpulse, burnTime: m.burnTime, grain: "endBurn" });
      let sum = 0;
      for (let i = 0; i < curve.length; i++) {
        if (i > 0) sum += ((curve[i - 1].F + curve[i].F) / 2) * (curve[i].t - curve[i - 1].t);
        cum.push(sum);
      }
      totalImpulse = m.totalImpulse;
      propMass = m.totalImpulse / (m.isp * G0);
    }
  }

  const chuteComp = findParachute(rocket);
  const chute = chuteComp
    ? {
        area: Math.PI * (chuteComp.diameterM / 2) ** 2,
        cd: chuteComp.cdManual ?? 0.8,
        deployDelayS: chuteComp.deployDelayS,
      }
    : null;

  return {
    rocket,
    cond,
    curve,
    cum,
    totalImpulse,
    m0: a.liftoffMass,
    propMass,
    refArea: Math.PI * (a.referenceDiameter / 2) ** 2,
    cnTotal: bar.cnTotal,
    cpCg: bar.cp - a.cg,
    totalLength: a.totalLength,
    rodDir: rodDirection(cond),
    rodQ: rodQuat(cond),
    rodLen: cond.launchRodLengthM,
    chute,
    chuteActive: false,
    vacuum,
    dt: cond.timestepS,
  };
}

export function simulate(rocket: TechRocket, opts: SimOptions = {}): TechFlightResult {
  const ctx = buildCtx(rocket, opts.vacuum ?? false);
  const cond = ctx.cond;
  const dt = Math.max(cond.timestepS, 0.0005);
  const maxSteps = opts.maxSteps ?? Math.ceil(cond.maxTimeS / dt) + 10;

  let s: St = { p: [0, 0, 0], v: [0, 0, 0], q: ctx.rodQ, w: [0, 0, 0] };
  let t = 0;
  let onRod = true;
  let deployed = false;
  let deployT = Infinity;
  const chuteComp = findParachute(rocket);
  const burnEnd = ctx.curve.length ? ctx.curve[ctx.curve.length - 1].t : 0;

  if (chuteComp && chuteComp.deployEvent === "ejection") {
    deployT = burnEnd + chuteComp.deployDelayS;
    const id = findMotorId(rocket);
    if (id) {
      const m = motorSpecsFromCatalog(id);
      if (m) deployT = burnEnd + m.delay + chuteComp.deployDelayS;
    }
  }

  const samples: TechSimSample[] = [];
  let railExitMps = 0;
  let railExitTimeS = 0;
  let prevVz = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (onRod) {
      s.q = ctx.rodQ;
      const proj = s.p[0] * ctx.rodDir[0] + s.p[1] * ctx.rodDir[1] + s.p[2] * ctx.rodDir[2];
      if (proj < ctx.rodLen) {
        s.p = [ctx.rodDir[0] * proj, ctx.rodDir[1] * proj, ctx.rodDir[2] * proj];
        const sv = s.v[0] * ctx.rodDir[0] + s.v[1] * ctx.rodDir[1] + s.v[2] * ctx.rodDir[2];
        s.v = [ctx.rodDir[0] * sv, ctx.rodDir[1] * sv, ctx.rodDir[2] * sv];
        s.w = [0, 0, 0];
      } else {
        onRod = false;
      }
    }

    const k1 = deriv(ctx, s, t);
    const k2 = deriv(ctx, rkMid(s, k1, dt / 2), t + dt / 2);
    const k3 = deriv(ctx, rkMid(s, k2, dt / 2), t + dt / 2);
    const k4 = deriv(ctx, rkMid(s, k3, dt), t + dt);
    s = rkCombine(s, k1, k2, k3, k4, dt);

    if (ctx.vacuum && t >= burnEnd) {
      return vacuumResult(s);
    }

    t += dt;

    if (chuteComp && !deployed) {
      if (chuteComp.deployEvent === "apogee") {
        // Apogee = dikey hız pozitiften negatife geçer
        if (prevVz >= 0 && s.v[2] < 0) {
          deployT = t + chuteComp.deployDelayS;
          deployed = true;
        }
      } else if (chuteComp.deployEvent === "altitude") {
        if (prevVz >= 0 && s.v[2] < 0 && s.p[2] <= chuteComp.deployAltitudeM) {
          deployT = t + chuteComp.deployDelayS;
          deployed = true;
        }
      } else if (t >= deployT) {
        deployed = true;
      }
    }
    prevVz = s.v[2];
    ctx.chuteActive = deployed && t >= deployT;

    const prevV = samples.length ? samples[samples.length - 1] : null;
    if (railExitTimeS === 0 && !onRod) {
      railExitTimeS = t;
      railExitMps = Math.hypot(s.v[0], s.v[1], s.v[2]);
    }

    const speed = Math.hypot(s.v[0], s.v[1], s.v[2]);
    const accelG =
      prevV
        ? Math.hypot((s.v[0] - prevV.vx) / dt, (s.v[1] - prevV.vy) / dt, (s.v[2] - prevV.vz) / dt) / G0
        : 0;
    const bz = qRot([0, 0, 1], s.q);
    void (bz.length);
    const alphaDeg = 0;

    samples.push({
      t, x: s.p[0], y: s.p[1], z: s.p[2],
      vx: s.v[0], vy: s.v[1], vz: s.v[2],
      speed,
      massKg: ctx.m0 - ctx.propMass * (cumAt(ctx, Math.min(t, burnEnd)) / Math.max(ctx.totalImpulse, 1e-9)),
      accelG,
      alphaDeg,
      deployed,
      onRod,
    });

    if (s.p[2] <= 0 && !onRod && t > 0.1) {
      s.p[2] = 0;
      const spd = Math.hypot(s.v[0], s.v[1], s.v[2]);
      return finish(samples, t, spd, railExitMps, railExitTimeS, deployed);
    }
  }

  const spd = Math.hypot(s.v[0], s.v[1], s.v[2]);
  return finish(samples, t, spd, railExitMps, railExitTimeS, deployed);
}

function vacuumResult(s: St): TechFlightResult {
  const speed = Math.hypot(s.v[0], s.v[1], s.v[2]);
  return {
    samples: [],
    summary: {
      apogeeM: 0, apogeeTimeS: 0, maxVelMps: speed, maxMach: 0, maxAccelG: 0,
      flightTimeS: 0, landingMps: 0, driftM: 0, railExitMps: 0, railExitTimeS: 0, deployTimeS: 0,
    },
  };
}

function finish(
  samples: TechSimSample[],
  flightTimeS: number,
  landingMps: number,
  railExitMps: number,
  railExitTimeS: number,
  deployed: boolean
): TechFlightResult {
  let apogeeM = 0;
  let apogeeTimeS = 0;
  let maxVelMps = 0;
  let maxAccelG = 0;
  for (const s of samples) {
    if (s.z > apogeeM) {
      apogeeM = s.z;
      apogeeTimeS = s.t;
    }
    if (s.speed > maxVelMps) maxVelMps = s.speed;
    if (s.accelG > maxAccelG) maxAccelG = s.accelG;
  }
  const last = samples.length ? samples[samples.length - 1] : null;
  const driftM = last ? Math.hypot(last.x, last.y) : 0;
  const maxMach = maxVelMps / A_SOUND;
  const deployTimeS = samples.find((s) => s.deployed)?.t ?? -1;
  void deployed;
  return {
    samples,
    summary: {
      apogeeM, apogeeTimeS, maxVelMps, maxMach, maxAccelG,
      flightTimeS, landingMps, driftM, railExitMps, railExitTimeS, deployTimeS,
    },
  };
}

function rkMid(s: St, d: St, dt: number): St {
  return {
    p: [s.p[0] + d.p[0] * dt, s.p[1] + d.p[1] * dt, s.p[2] + d.p[2] * dt],
    v: [s.v[0] + d.v[0] * dt, s.v[1] + d.v[1] * dt, s.v[2] + d.v[2] * dt],
    q: qNorm(qMul(s.q, [1 + (d.q[0] * dt) / 2, (d.q[1] * dt) / 2, (d.q[2] * dt) / 2, (d.q[3] * dt) / 2])),
    w: [s.w[0] + d.w[0] * dt, s.w[1] + d.w[1] * dt, s.w[2] + d.w[2] * dt],
  };
}

function rkCombine(s: St, k1: St, k2: St, k3: St, k4: St, dt: number): St {
  const p = [
    s.p[0] + (dt / 6) * (k1.p[0] + 2 * k2.p[0] + 2 * k3.p[0] + k4.p[0]),
    s.p[1] + (dt / 6) * (k1.p[1] + 2 * k2.p[1] + 2 * k3.p[1] + k4.p[1]),
    s.p[2] + (dt / 6) * (k1.p[2] + 2 * k2.p[2] + 2 * k3.p[2] + k4.p[2]),
  ] as Vec3;
  const v = [
    s.v[0] + (dt / 6) * (k1.v[0] + 2 * k2.v[0] + 2 * k3.v[0] + k4.v[0]),
    s.v[1] + (dt / 6) * (k1.v[1] + 2 * k2.v[1] + 2 * k3.v[1] + k4.v[1]),
    s.v[2] + (dt / 6) * (k1.v[2] + 2 * k2.v[2] + 2 * k3.v[2] + k4.v[2]),
  ] as Vec3;
  const q = [
    s.q[0] + (dt / 6) * (k1.q[0] + 2 * k2.q[0] + 2 * k3.q[0] + k4.q[0]),
    s.q[1] + (dt / 6) * (k1.q[1] + 2 * k2.q[1] + 2 * k3.q[1] + k4.q[1]),
    s.q[2] + (dt / 6) * (k1.q[2] + 2 * k2.q[2] + 2 * k3.q[2] + k4.q[2]),
    s.q[3] + (dt / 6) * (k1.q[3] + 2 * k2.q[3] + 2 * k3.q[3] + k4.q[3]),
  ] as Quat;
  const w = [
    s.w[0] + (dt / 6) * (k1.w[0] + 2 * k2.w[0] + 2 * k3.w[0] + k4.w[0]),
    s.w[1] + (dt / 6) * (k1.w[1] + 2 * k2.w[1] + 2 * k3.w[1] + k4.w[1]),
    s.w[2] + (dt / 6) * (k1.w[2] + 2 * k2.w[2] + 2 * k3.w[2] + k4.w[2]),
  ] as Vec3;
  return { p, v, q: qNorm(q), w };
}

/** Vakum modunda ulaşılan Δv (m/s) — Tsiolkovsky karşılaştırması. */
export function simulateVacuum(rocket: TechRocket): number {
  const res = simulate(rocket, { vacuum: true });
  return res.summary.maxVelMps;
}

/** Sonuçtan t anındaki örneği doğrusal enterpolasyonla bulur; aralık dışında uç örnek. */
export function sampleAtTime(result: TechFlightResult, t: number): TechSimSample {
  const samples = result.samples;
  if (samples.length === 0) {
    return { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, massKg: 0, accelG: 0, alphaDeg: 0, deployed: false, onRod: false };
  }
  if (t <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = Math.min(1, Math.max(0, (t - a.t) / Math.max(b.t - a.t, 1e-9)));
  const lerp = (p: number, q: number) => p + (q - p) * f;
  return {
    t: lerp(a.t, b.t),
    x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z),
    vx: lerp(a.vx, b.vx), vy: lerp(a.vy, b.vy), vz: lerp(a.vz, b.vz),
    speed: lerp(a.speed, b.speed),
    massKg: lerp(a.massKg, b.massKg),
    accelG: lerp(a.accelG, b.accelG),
    alphaDeg: lerp(a.alphaDeg, b.alphaDeg),
    deployed: b.deployed,
    onRod: b.onRod,
  };
}

function findMotorId(r: TechRocket): string | null {
  const walk = (cs: TechRocket["stages"][0]["components"]): string | null => {
    for (const c of cs) {
      if (c.kind === "motormount" && c.motorId) return c.motorId;
      if (c.kind === "bodytube") {
        const hit = walk(c.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const st of r.stages) {
    const hit = walk(st.components);
    if (hit) return hit;
  }
  return null;
}