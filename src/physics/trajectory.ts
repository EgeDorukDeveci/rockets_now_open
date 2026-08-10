// 3-DOF uçuş entegratörü (sabit dt, RK4).
// Kuvvetler (doküman §4):
//   1. İtki: aktif motor(lar)ın itki eğrisinden; kütle azalması mdot = F/(Isp·g0)
//   2. Yerçekimi: g(h) = g0·(R/(R+h))²
//   3. Sürükleme: D = ½·ρ·v_rel²·Cd(Mach)·A (transonik artış dahil)
//   4. ISA atmosfer (atmosphere.ts)
//   5. Rüzgar: göreli hız üzerinden (wind.ts)
//   6. Fırlatma rayı: ray boyu kılavuzluk
//   7. Olay algılama (events.ts)
// Doğrulama: vakum modunda Tsiolkovsky ile ±%1 (kabul testi, doküman §4).

import { EARTH_RADIUS, G0, PI } from "./constants";
import { atmosphere } from "./atmosphere";
import { ispAtAltitude, MotorSpec } from "./motors/types";
import { thrustAt } from "./motors/curve";
import { dragAtMach, DRAG_CALIBRATION } from "./drag";
import { RocketAssembly, resolveMotor } from "./rocket";
import { FlightEvent, FlightEventId } from "./events";
import { windAt } from "./wind";
import { ESTES_MOTORS } from "./motors/catalog";
import { MAX_LANDING_VEL_MPS } from "./acceptance";
import { MotorChoice, RocketConfig } from "../types";

export interface FlightState {
  t: number;
  /** x = menzil, y = yukarı, z = çapraz (dünya koordinatları) */
  pos: [number, number, number];
  vel: [number, number, number];
  mass: number;
  /** Booster'lar bağlı mı */
  boosters: boolean;
  /** Kurtarma açıldı mı */
  deployed: boolean;
  drogue: boolean;
  main: boolean;
  /** Ray üzerinde mi */
  onRail: boolean;
  /** Ray boyunca kat edilen mesafe, m */
  railDist: number;
  /** Roll açısı (radyan) — cant kanat görseli */
  roll: number;
  rollRate: number;
}

export interface TelemetrySample {
  t: number;
  altM: number;
  velMps: number;
  vertMps: number;
  accelMps2: number;
  gForce: number;
  mach: number;
  q: number;
  thrustN: number;
  propMassKg: number;
  massKg: number;
  pos: [number, number, number];
  vel: [number, number, number];
  /** Ray üzerinde mi (raydan çıkışa kadar true) */
  onRail: boolean;
}

export interface FlightResult {
  state: FlightState;
  events: FlightEvent[];
  telemetry: TelemetrySample[];
  maxAltM: number;
  maxVelMps: number;
  maxMach: number;
  maxG: number;
  maxQ: number;
  driftM: number;
  landingVelMps: number;
  flightTimeS: number;
  success: boolean;
  message: string;
}

export interface FlightParams {
  assembly: RocketAssembly;
  /** Kısma (sıvı/hibrit) — 0-1 */
  throttle: number;
  /** Vakum modu (doğrulama testi) */
  vacuum?: boolean;
  /** Tahmin modu: telemetri örnekleme oranını düşür, zaman sınırı koy */
  prediction?: boolean;
}

/** Uçuş sırası: en alt kademe (indeks n-1) önce ateşlenir. */
export function flightOrder(config: RocketConfig): number[] {
  const idx: number[] = [];
  for (let i = config.stages.length - 1; i >= 0; i--) idx.push(i);
  return idx;
}

interface MotorSource {
  spec: MotorSpec;
  /** Ateşleme zamanı, s */
  t0: number;
  /** Bu kaynağın bağlı olduğu kütle düşümü: (zaman, kütle) */
  dropAt: number;
  dropMass: number;
  /** Kısma oranı (0-1) — UI'deki motor/booster kısma ayarı */
  throttle: number;
  /** Kısma ile uzatılmış etkin yanma süresi, s */
  burnTime: number;
}

/** Kısma uygulanmış itki: F'(t') = k·F(k·t') — itki alanı korunur, yanma 1/k uzar. */
function thrustScaled(src: MotorSource, localT: number, globalThrottle: number): number {
  const k = Math.max(src.throttle, 0.05);
  const curve = motorThrustCurve(src.spec);
  if (k >= 1 - 1e-9) return thrustAt(curve, localT) * globalThrottle;
  return thrustAt(curve, localT * k) * k * globalThrottle;
}

import { motorThrustCurve } from "./motors/types";

function resolveMotors(choice: MotorChoice): MotorSpec[] {
  return resolveMotor(choice);
}

function recoveryDelayOf(config: RocketConfig): number {
  const top = config.stages[0];
  const ch = top.motor.choice;
  if (ch.kind === "estes") {
    const est = ESTES_MOTORS.find((m) => m.id === ch.id);
    if (est) return est.delay;
  }
  if (ch.kind === "apcp") return ch.delay;
  return 0;
}

/**
 * Sabit dt'li uçuş simülasyonu (RK4).
 */
export function simulateFlight(params: FlightParams): FlightResult {
  const { assembly, throttle = 1, vacuum = false, prediction = false } = params;
  const config = assembly.config;
  // Öngörü modu: canlı yeniden hesaplamada hız için kaba adım yeterli.
  // Vakum kabul testlerinde (sürtünme yok) hassas adım korunur.
  // dt eksikse savunmacı varsayılan: NaN adım tüm uçuşu NaN yapar ve
  // maxSteps döngüsü asılı kalır.
  const dt = prediction && !vacuum
    ? Math.max(config.dt ?? 0.05, 0.05)
    : Math.max(config.dt ?? 0.002, 0.002);
  const order = flightOrder(config);
  const railLen = config.railM;
  const tiltRad = (config.railTiltDeg * PI) / 180;
  const railDir: [number, number, number] = [Math.sin(tiltRad), Math.cos(tiltRad), 0];

  // --- Motor kaynakları ---
  const sources: MotorSource[] = [];
  let prevBurnout = 0;
  // Booster'lar: t=0'da. NOT: boosterSpecs tek bir booster'ın motor listesidir
  // (count kopyaları dahil); boosterMasses[i] ise tek bir booster'ın toplam
  // kütlesidir. Kuru kütle = boosterTotal - (tek booster'ın yakıtı).
  const boosterSpecs = config.boosterCount > 0 ? resolveMotors(config.boosterMotor.choice) : [];
  const boosterProp = boosterSpecs.reduce((a, s) => a + s.propellant, 0);
  const boosterTotal = assembly.boosterMasses.length > 0 ? assembly.boosterMasses[0] : 0;
  const boosterBurnout = boosterSpecs.length > 0 ? Math.max(...boosterSpecs.map((s) => s.burnTime)) : Infinity;
  const boosterThrottle = Math.max(config.boosterMotor.throttle, 0.05);
  const boosterBurnEff = boosterBurnout / boosterThrottle;
  // Toplam düşen kütle = boosterCount × (tek booster kuru kütlesi); her
  // motor kaynağı (booster başına boosterSpecs.length adet) eşit pay düşürür.
  const boosterDryPerSource = boosterSpecs.length > 0
    ? Math.max(boosterTotal - boosterProp, 0) / boosterSpecs.length
    : 0;
  for (const sp of boosterSpecs) {
    for (let i = 0; i < config.boosterCount; i++) {
      sources.push({ spec: sp, t0: 0, dropAt: boosterBurnEff + 0.6, dropMass: boosterDryPerSource, throttle: boosterThrottle, burnTime: boosterBurnEff });
    }
  }
  // Kademeler: uçuş sırasıyla
  for (let k = 0; k < order.length; k++) {
    const stageIdx = order[k];
    const stage = config.stages[stageIdx];
    const specs = resolveMotors(stage.motor.choice);
    const isFirst = k === 0;
    const isLast = k === order.length - 1; // en son ateşlenen = en üst kademe
    // Soğuk ayrım gecikmesi SADECE kademeler arasındadır; ilk kademe t=0'da ateşlenir.
    const sepDelay = isFirst || isLast ? 0 : stage.separation === "hot" ? 0 : 0.4;
    const t0 = prevBurnout + sepDelay;
    const burn = specs.length > 0 ? Math.max(...specs.map((s) => s.burnTime)) : 0;
    const throt = Math.max(stage.motor.throttle, 0.05);
    const burnEff = burn / throt;
    // Kademenin kuru kütlesi (sönüm + ayrımda düşer): tüm motor kopyaları
    // birlikte bir kez düşürülür — her kaynak eşit pay alır (toplam = stageDry).
    const stageProp = specs.reduce((a, s) => a + s.propellant, 0);
    const stageDry = Math.max(assembly.stageMasses[stageIdx] - stageProp, 0);
    const dropPerSource = specs.length > 0 ? stageDry / specs.length : 0;
    for (const sp of specs) {
      sources.push({ spec: sp, t0, dropAt: t0 + burnEff + sepDelay, dropMass: isLast ? 0 : dropPerSource, throttle: throt, burnTime: burnEff });
    }
    prevBurnout = t0 + burnEff;
  }

  // Motorsuz roket: kaynak yoksa -Infinity/erken kurtarma açılışı yerine
  // erken abort döndür.
  if (sources.length === 0) {
    const emptyState: FlightState = {
      t: 0,
      pos: [0, 0, 0],
      vel: [0, 0, 0],
      mass: assembly.liftoffMassKg,
      boosters: false,
      deployed: false,
      drogue: false,
      main: false,
      onRail: true,
      railDist: 0,
      roll: 0,
      rollRate: 0,
    };
    const msg = "MOTOR YOK: Fırlatma iptal edildi";
    return {
      state: emptyState,
      events: [
        { id: "preflight", t: 0, altM: 0, velMps: 0, mach: 0, message: "Ön uçuş hazır" },
        { id: "abort", t: 0, altM: 0, velMps: 0, mach: 0, message: msg },
      ],
      telemetry: [{
        t: 0, altM: 0, velMps: 0, vertMps: 0, accelMps2: 0, gForce: 0,
        mach: 0, q: 0, thrustN: 0, propMassKg: 0, massKg: assembly.liftoffMassKg,
        pos: [0, 0, 0], vel: [0, 0, 0],
        onRail: true,
      }],
      maxAltM: 0, maxVelMps: 0, maxMach: 0, maxG: 0, maxQ: 0,
      driftM: 0, landingVelMps: 0, flightTimeS: 0,
      success: false,
      message: msg,
    };
  }

  // --- Durum ---
  const state: FlightState = {
    t: 0,
    pos: [0, 0, 0],
    vel: [0, 0, 0],
    mass: assembly.liftoffMassKg,
    boosters: config.boosterCount > 0,
    deployed: false,
    drogue: false,
    main: false,
    onRail: true,
    railDist: 0,
    roll: 0,
    rollRate: 0,
  };

  const events: FlightEvent[] = [];
  const telemetry: TelemetrySample[] = [];
  const sampleInterval = prediction ? 0.25 : dt;
  let nextSample = 0;

  const pushEvent = (id: FlightEventId, st: FlightState, message: string) => {
    events.push({
      id,
      t: st.t,
      altM: st.pos[1],
      velMps: Math.hypot(st.vel[0], st.vel[1], st.vel[2]),
      mach: machOf(st, vacuum),
      message,
    });
  };

  const firedIgnitions = new Set<MotorSource>();
  const firedBurnouts = new Set<MotorSource>();

  // --- Kuvvet fonksiyonu ---
  const accel = (st: FlightState): [number, number, number] => {
    let F = 0;
    for (const src of sources) {
      const localT = st.t - src.t0;
      if (localT < 0 || localT > src.burnTime) continue;
      const at = thrustScaled(src, localT, throttle);
      if (at > 0) F += at;
    }
    const h = st.pos[1];
    const g = G0 * (EARTH_RADIUS / (EARTH_RADIUS + h)) ** 2;
    const wind = windAt(config.windMps, (config.windDeg * PI) / 180, h, st.t);
    const vRelX = st.vel[0] - wind.vec[0];
    const vRelY = st.vel[1];
    const vRelZ = st.vel[2] - wind.vec[2];
    const vRel = Math.hypot(vRelX, vRelY, vRelZ);
    const atm = vacuum ? { rho: 0, a: 340.3, P: 0 } : atmosphere(h);

    let dragA = 0;
    if (vRel > 0.01) {
      const mach = vRel / Math.max(atm.a, 1);
      const { cd } = dragAtMach(assembly.cdSubsonic * DRAG_CALIBRATION, mach, 0.82);
      let cdEff = cd;
      let extraA = 0;
      if (st.deployed) {
        const rec = config.stages[0].recovery;
        if (rec.type === "parachute") {
          if (st.drogue && !st.main) {
            extraA = 0.6 * PI * (rec.drogueDiaM / 2) ** 2;
          } else {
            extraA = 0.78 * PI * (rec.diameterM / 2) ** 2;
          }
        } else if (rec.type === "streamer") {
          extraA = rec.diameterM * 0.08 * 2.5;
        } else if (rec.type === "tumble") {
          cdEff = cd * 3.2;
        }
      }
      dragA = assembly.refAreaM2 * cdEff + extraA;
    }
    const q = 0.5 * atm.rho * vRel * vRel;

    // İtki yönü: gövde ekseni ray doğrultusunda sabittir (motor sabit montajlı,
    // jimnallı yok). Hız vektörünü izlemek rüzgârla pozitif geri besleme yaratıp
    // uzun yanmalı roketleri yatay uçuşa çeviriyordu.
    let tx = railDir[0], ty = railDir[1], tz = railDir[2];
    const ax = (F * tx - dragA * q * vRelX / Math.max(vRel, 1e-9)) / st.mass;
    const ay = (F * ty - st.mass * g - dragA * q * vRelY / Math.max(vRel, 1e-9)) / st.mass;
    const az = (F * tz - dragA * q * vRelZ / Math.max(vRel, 1e-9)) / st.mass;
    return [ax, ay, az];
  };

  const record = (st: FlightState) => {
    const v = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
    const h = st.pos[1];
    const atm = vacuum ? { rho: 0, a: 340.3 } : atmosphere(h);
    const mach = v / Math.max(atm.a, 1);
    const wind = windAt(config.windMps, (config.windDeg * PI) / 180, h, st.t);
    const vRel = Math.hypot(st.vel[0] - wind.vec[0], st.vel[1], st.vel[2] - wind.vec[2]);
    const q = 0.5 * atm.rho * vRel * vRel;
    let thrustNow = 0;
    for (const src of sources) {
      const localT = st.t - src.t0;
      if (localT < 0 || localT > src.burnTime) continue;
      const at = thrustScaled(src, localT, throttle);
      if (at > 0) thrustNow += at;
    }
    let propMass = 0;
    for (const src of sources) {
      const localT = st.t - src.t0;
      if (localT < 0 || localT > src.burnTime) continue;
      propMass += (src.spec.propellant * (1 - localT / Math.max(src.burnTime, 1e-9)));
    }
    telemetry.push({
      t: st.t,
      altM: h,
      velMps: v,
      vertMps: st.vel[1],
      accelMps2: 0,
      gForce: 0,
      mach,
      q,
      thrustN: thrustNow,
      propMassKg: propMass,
      massKg: st.mass,
      pos: [st.pos[0], st.pos[1], st.pos[2]],
      vel: [st.vel[0], st.vel[1], st.vel[2]],
      onRail: st.onRail,
    });
  };

  record(state);
  pushEvent("preflight", state, "Ön uçuş hazır");

  const recovery = config.stages[0].recovery;
  const avionicsOk = config.stages[0].payload.avionics !== "none";
  const mainAlt = 150;

  let maxAlt = 0, maxVel = 0, maxMach = 0, maxG = 0, maxQ = 0;
  let wasLiftoff = false;
  let apogeeDetected = false;
  let landed = false;
  let success = false;
  let message = "";
  let landingVel = 0;

  // Motor yoksa 0 (erken dönüldüğü için burada mutlaka >= 1 kaynak vardır,
  // ancak savunmacı guard boş dizide -Infinity üretimini engeller).
  const lastBurnoutTime = sources.length ? Math.max(...sources.map((s) => s.t0 + s.burnTime)) : 0;

  let steps = 0;
  const maxSteps = 4_000_000;

  while (!landed && steps < maxSteps) {
    steps++;
    const st = state;
    const t = st.t;
    const vyBefore = st.vel[1];

    // --- Kütle düşümleri (booster ayrımı, kademe ayrımı) ---
    for (const src of sources) {
      if (t >= src.dropAt && src.dropMass > 0 && st.mass > src.dropMass) {
        st.mass -= src.dropMass;
        if (config.boosterCount > 0 && src.spec === boosterSpecs[0]) {
          if (st.boosters) {
            st.boosters = false;
            pushEvent("boosterSep", st, "Booster'lar ayrıldı");
          }
        } else {
          pushEvent("stageSep", st, "Kademe ayrımı");
        }
        src.dropMass = 0;
      }
    }

    // --- Ateşleme / sönüm olayları ---
    for (const src of sources) {
      if (t >= src.t0 && !firedIgnitions.has(src)) {
        firedIgnitions.add(src);
        pushEvent("ignition", st, "Motor ateşlendi");
      }
      if (t >= src.t0 + src.burnTime && !firedBurnouts.has(src)) {
        firedBurnouts.add(src);
        pushEvent("burnout", st, "Motor sönümü");
      }
    }

    // --- Kurtarma tetiği ---
    if (!st.deployed) {
      let trigger = false;
      let triggerMsg = "";
      if (recovery.trigger === "delay") {
        const d = recoveryDelayOf(config);
        if (t >= lastBurnoutTime + d) {
          trigger = true;
          triggerMsg = "Motor gecikme yükü ile açıldı";
        }
      } else if (recovery.trigger === "apogee") {
        if (!avionicsOk) {
          if (t >= lastBurnoutTime + 2) { trigger = true; triggerMsg = "Apogee algılanamadı — gecikmeli açılış"; }
        } else if (apogeeDetected && st.vel[1] < 0) {
          trigger = true;
          triggerMsg = "Altimetre apogee algıladı";
        }
      } else if (recovery.trigger === "timer") {
        if (t >= lastBurnoutTime + recovery.timerSeconds) {
          trigger = true;
          triggerMsg = "Zamanlayıcı tetikledi";
        }
      }
      if (trigger) {
        st.deployed = true;
        const v = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
        if (v > 25 && recovery.type === "parachute") {
          st.deployed = false;
          message = "PARÇALANMA: Kurtarma 25 m/s üzerinde açıldı";
          pushEvent("shred", st, message);
          landed = true;
          success = false;
        } else if (recovery.drogueDiaM > 0) {
          st.drogue = true;
          pushEvent("drogueDeploy", st, triggerMsg);
        } else {
          st.main = true;
          pushEvent("deploy", st, triggerMsg);
        }
      }
    } else if (st.drogue && !st.main && st.pos[1] <= mainAlt) {
      st.main = true;
      pushEvent("mainDeploy", st, "Ana paraşüt açıldı");
    }

    // --- RK4 ---
    const k1 = accel(st);
    const s2: FlightState = {
      ...st,
      pos: [st.pos[0] + (k1[0] * dt) / 2, st.pos[1] + (k1[1] * dt) / 2, st.pos[2] + (k1[2] * dt) / 2],
      vel: [st.vel[0] + (k1[0] * dt) / 2, st.vel[1] + (k1[1] * dt) / 2, st.vel[2] + (k1[2] * dt) / 2],
    };
    const k2 = accel(s2);
    const s3: FlightState = {
      ...st,
      pos: [st.pos[0] + (k2[0] * dt) / 2, st.pos[1] + (k2[1] * dt) / 2, st.pos[2] + (k2[2] * dt) / 2],
      vel: [st.vel[0] + (k2[0] * dt) / 2, st.vel[1] + (k2[1] * dt) / 2, st.vel[2] + (k2[2] * dt) / 2],
    };
    const k3 = accel(s3);
    const s4: FlightState = {
      ...st,
      pos: [st.pos[0] + k3[0] * dt, st.pos[1] + k3[1] * dt, st.pos[2] + k3[2] * dt],
      vel: [st.vel[0] + k3[0] * dt, st.vel[1] + k3[1] * dt, st.vel[2] + k3[2] * dt],
    };
    const k4 = accel(s4);
    const ax = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
    const ay = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
    const az = (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) / 6;

    // Kütle azalması (mdot = F/(Isp·g0))
    let mdot = 0;
    let thrustNow = 0;
    for (const src of sources) {
      const localT = t - src.t0;
      if (localT < 0 || localT > src.burnTime) continue;
      const at = thrustScaled(src, localT, throttle);
      if (at <= 0) continue;
      thrustNow += at;
      const pRatio = vacuum ? 0 : atmosphere(st.pos[1]).P / 101325;
      mdot += at / (ispAtAltitude(src.spec, pRatio) * G0);
    }

    // Ray fazı
    if (st.onRail) {
      const v = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
      const accelAlong = k1[0] * railDir[0] + k1[1] * railDir[1] + k1[2] * railDir[2];
      st.railDist += v * dt + 0.5 * accelAlong * dt * dt;
      if (st.railDist >= railLen) {
        st.onRail = false;
        pushEvent("railExit", st, "Raydan çıkış");
      }
    }

    st.vel = [st.vel[0] + ax * dt, st.vel[1] + ay * dt, st.vel[2] + az * dt];
    st.pos = [st.pos[0] + st.vel[0] * dt, st.pos[1] + st.vel[1] * dt, st.pos[2] + st.vel[2] * dt];
    st.t += dt;
    st.mass = Math.max(st.mass - mdot * dt, 0.001);

    // --- Apogee algılama: entegrasyon sonrası dikey hız işareti ---
    if (!apogeeDetected && vyBefore > 0 && st.vel[1] <= 0) {
      apogeeDetected = true;
      if (!st.deployed) pushEvent("apogee", st, "Apogee — yükseliş sonu");
    }

    // Roll (cant kanatlar)
    const cantTotal = config.stages.reduce((a, s) => a + Math.abs(s.fins.cantDeg), 0);
    if (cantTotal > 0 && !st.onRail) {
      const v = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
      st.rollRate = (cantTotal * (PI / 180)) * (v / Math.max(assembly.diameterM, 0.01)) * 0.18;
      st.roll += st.rollRate * dt;
    }

    // --- Telemetri ve olaylar ---
    const alt = st.pos[1];
    const v = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
    const atm = vacuum ? { rho: 0, a: 340.3 } : atmosphere(alt);
    const mach = v / Math.max(atm.a, 1);
    const wind = windAt(config.windMps, (config.windDeg * PI) / 180, alt, st.t);
    const vRel = Math.hypot(st.vel[0] - wind.vec[0], st.vel[1], st.vel[2] - wind.vec[2]);
    const q = 0.5 * atm.rho * vRel * vRel;

    if (!wasLiftoff && t > 0.05 && st.pos[1] > 0.01 && !st.onRail) {
      wasLiftoff = true;
      pushEvent("liftoff", st, "Kalkış!");
    }
    if (q > maxQ) maxQ = q;
    if (mach > maxMach) maxMach = mach;
    if (alt > maxAlt) maxAlt = alt;
    if (v > maxVel) maxVel = v;
    if (!events.some((e) => e.id === "maxQ") && maxQ > 80 && q < maxQ * 0.995) {
      pushEvent("maxQ", st, `Max dinamik basınç ${(maxQ / 1000).toFixed(1)} kPa`);
    }
    if (!events.some((e) => e.id === "mach09") && mach >= 0.9) pushEvent("mach09", st, "Mach 0.9 — transonik bölge");
    if (!events.some((e) => e.id === "mach1") && mach >= 1.0) pushEvent("mach1", st, "MACH 1 — SES HIZI");
    if (!events.some((e) => e.id === "mach11") && mach >= 1.1) pushEvent("mach11", st, "Mach 1.1");

    const gForce = Math.hypot(ax, ay, az) / 9.80665;
    if (gForce > maxG) maxG = gForce;

    // İniş / çakılma
    if (alt <= 0 && st.t > 0.5) {
      landed = true;
      landingVel = Math.hypot(st.vel[0], st.vel[1], st.vel[2]);
      if (!st.deployed || landingVel > MAX_LANDING_VEL_MPS) {
        success = false;
        message = !st.deployed
          ? "ÇAKILMA: Kurtarma sistemi açılmadı"
          : `ÇAKILMA: İniş hızı ${landingVel.toFixed(1)} m/s`;
        pushEvent("crash", st, message);
      } else {
        success = true;
        message = `İniş ${landingVel.toFixed(1)} m/s — MİSYON BAŞARILI`;
        pushEvent("touchdown", st, message);
      }
    }

    // Kalkış yok (T/W yetersiz)
    if (!wasLiftoff && t > 8 && st.railDist < 0.1) {
      landed = true;
      success = false;
      message = "KALKIŞ YOK: İtki/ağırlık oranı yetersiz";
      pushEvent("abort", st, message);
    }

    if (st.t >= nextSample) {
      nextSample = st.t + sampleInterval;
      record(st);
    }
    if (prediction && st.t > 3600) { landed = true; success = false; message = "Zaman aşımı"; }
  }

  // Telemetri türevleri
  for (let i = 1; i < telemetry.length; i++) {
    const a = telemetry[i - 1];
    const b = telemetry[i];
    const d = Math.max(b.t - a.t, 1e-6);
    b.accelMps2 = (b.velMps - a.velMps) / d;
    b.gForce = b.accelMps2 / 9.80665;
  }

  return {
    state,
    events,
    telemetry,
    maxAltM: maxAlt,
    maxVelMps: maxVel,
    maxMach,
    maxG,
    maxQ,
    driftM: Math.hypot(state.pos[0], state.pos[2]),
    landingVelMps: landingVel,
    flightTimeS: state.t,
    success,
    message,
  };
}

function machOf(st: FlightState, vacuum: boolean): number {
  const atm = vacuum ? { a: 340.3 } : atmosphere(st.pos[1]);
  return Math.hypot(st.vel[0], st.vel[1], st.vel[2]) / Math.max(atm.a, 1);
}
