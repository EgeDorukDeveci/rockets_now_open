// Roket montajı: bileşen kütleleri, CG, CP, stabilite, sürükleme parametreleri, maliyet.
// Formüller:
//  - Tüp kütlesi: annulus hacmi × yoğunluk: ρ·π·((D/2)² − ((D−2t)/2)²)·L
//  - Koni (içi boş): yüzey alanı × cidar × ρ; dolu: hacim × ρ
//  - Kanat: planform alanı × kalınlık × ρ × adet
//  - CG: bileşenlerin kütle ağırlıklı ortalaması
//  - CP: Barrowman (barrowman.ts)
//  - Stabilite: (CP − CG)/D ≥ 1 kalibre (subsonik), ≥ 2 (süpersonik) — doküman §4.8

import {
  barrowmanBody,
  barrowmanFins,
  barrowmanNose,
  barrowmanTransition,
  combineBarrowman,
  FinGeometry,
} from "./barrowman";
import { dragSubsonic } from "./drag";
import { CANOPY_MATERIALS, FIN_MATERIALS, MATERIALS } from "./materials";
import { makeProfile } from "./noseShapes";
import { averageThrust, MotorSpec, motorThrustCurve } from "./motors/types";
import {
  CLASS_RANGES,
  classMid,
  ESTES_MOTORS,
  makeApcpMotor,
  makeColdGasMotor,
  makeHybridMotor,
  makeLiquidMotor,
} from "./motors/catalog";
import { PI } from "./constants";
import { AvionicsId, BodyConfig, FinConfig, MotorChoice, MotorConfig, NoseConfig, PayloadConfig, RecoveryConfig, RocketConfig, StageConfig } from "../types";

export interface ComponentMass {
  massKg: number;
  /** Burun ucundan kütle merkezi, m */
  cg: number;
  cost: number;
  note: string;
}

export interface StageAssembly {
  stageIndex: number;
  /** Bu kademenin burun ucundan itibaren yukarı kısımlar (kademe 0 = en üst?) — aşağıda tanım */
  lengthM: number;
  massKg: number;
  cgFromStackTip: number;
  parts: ComponentMass[];
}

export interface MotorInstance {
  spec: MotorSpec;
  /** Bu motorun (kademe gövdesinde) kütle merkezi — burun ucundan, m */
  cg: number;
}

export interface RocketAssembly {
  config: RocketConfig;
  /** Toplam uzunluk, m */
  totalLengthM: number;
  /** Referans çap (en büyük gövde), m */
  diameterM: number;
  /** Kalkış kütlesi (tüm yakıt dahil), kg */
  liftoffMassKg: number;
  /** Kuru kütle (yakıtlar hariç), kg */
  dryMassKg: number;
  /** CG (burun ucundan), m — kalkışta */
  cgM: number;
  /** CP (burun ucundan), m — alt ses */
  cpM: number;
  /** Stabilite marjı, kalibre */
  stabilityCal: number;
  /** İtki/ağırlık oranı (kalkış) */
  twr: number;
  /** Toplam maliyet, ₺ */
  cost: number;
  /** Referans alan, m² */
  refAreaM2: number;
  /** Islak alan, m² */
  wettedAreaM2: number;
  /** Karakteristik uzunluk, m */
  charLengthM: number;
  /** Alt ses Cd (0 hız, deniz seviyesi) */
  cdSubsonic: number;
  /** Motorların itki eğrileri (kademe sırasıyla), dizilimler */
  motorInstances: MotorInstance[];
  /** Her kademenin burun ucundan ölçülen alt sınırı (stack tipi = ilk kademenin burnu) */
  stageTops: number[];
  /** Kademe kütleleri (kalkış) */
  stageMasses: number[];
  /** Strapon kütleleri (kalkış) */
  boosterMasses: number[];
  /** Toplam yakıt (tüm kademeler + strapon), kg */
  propellantMassKg: number;
}

// ---------------------------------------------------------------------------
// Motor çözümleme
// ---------------------------------------------------------------------------

export function resolveMotor(choice: MotorChoice): MotorSpec[] {
  const specs: MotorSpec[] = [];
  const emit = (s: MotorSpec, count: number) => {
    for (let i = 0; i < count; i++) specs.push(s);
  };
  switch (choice.kind) {
    case "estes": {
      const est = ESTES_MOTORS.find((m) => m.id === choice.id) ?? ESTES_MOTORS[0];
      emit(est, choice.count);
      break;
    }
    case "apcp": {
      const [lo, hi] = CLASS_RANGES[choice.cls] ?? [5, 10];
      const it = lo + (hi - lo) * choice.impulsePct;
      emit(makeApcpMotor(choice.cls, choice.avgThrustN, choice.delay, it, 210, choice.grain), choice.count);
      break;
    }
    case "liquid":
      emit(makeLiquidMotor(choice.fuel, choice.name, choice.thrustN, choice.propMassKg, choice.dryFraction), choice.count);
      break;
    case "hybrid":
      emit(makeHybridMotor("Hibrit Motor", choice.thrustN, choice.propMassKg), choice.count);
      break;
    case "coldGas":
      emit(makeColdGasMotor(choice.thrustN, choice.propMassKg), choice.count);
      break;
  }
  return specs;
}

/** Motor seçiminden toplam kalkış itkisi. */
export function stageThrust(motor: MotorConfig, throttle = 1): number {
  const specs = resolveMotor(motor.choice);
  return specs.reduce((s, sp) => s + averageThrust(sp), 0) * throttle;
}

// ---------------------------------------------------------------------------
// Bileşen kütleleri
// ---------------------------------------------------------------------------

export function bodyMass(c: BodyConfig): ComponentMass {
  const mat = MATERIALS[c.material] ?? MATERIALS.kraft;
  const rOuter = c.diameterM / 2;
  const rInner = Math.max(rOuter - c.wallM, 0);
  const vol = PI * (rOuter * rOuter - rInner * rInner) * c.lengthM;
  const mass = vol * mat.density;
  const paintMass = c.paint ? c.lengthM * PI * c.diameterM * 0.06 / 1000 : 0; // ~60 g/m² boya
  const cost = c.lengthM * mat.pricePerMeter + (c.paint ? 5 : 0);
  // CG: gövdenin ortası, burun ucundan (üst kenar + L/2) — üst kenar stack tipinde 0 olacak
  return { massKg: mass + paintMass, cg: c.lengthM / 2, cost, note: "Gövde tüpü" };
}

export function noseMass(c: NoseConfig, diameterM: number, wallM: number): ComponentMass {
  const mat = MATERIALS[c.material] ?? MATERIALS.kraft;
  const length = c.lengthCalibers * diameterM;
  const R = diameterM / 2;
  const profile = makeProfile(c.profile);
  // Yüzey alanını profili döndürerek hesapla (koni yaklaşımı segmentleri)
  const SEG = 24;
  let surface = 0;
  let vol = 0;
  for (let i = 1; i <= SEG; i++) {
    const t0 = (i - 1) / SEG;
    const t1 = i / SEG;
    const y0 = profile.profile(t0, { fineness: length / R, powerN: c.powerN, bluntness: c.bluntness, secantK: 1.2 });
    const y1 = profile.profile(t1, { fineness: length / R, powerN: c.powerN, bluntness: c.bluntness, secantK: 1.2 });
    const r0 = R * y0;
    const r1 = R * y1;
    const segLen = Math.sqrt((t1 - t0) * length * (t1 - t0) * length + (r1 - r0) * (r1 - r0));
    surface += PI * (r0 + r1) * segLen;
    vol += (PI / 3) * ((t1 - t0) * length) * (r0 * r0 + r0 * r1 + r1 * r1);
  }
  const shoulderExtra = 2.2; // omuz + bağlantı payı + boya zırhı (gerçek koniler daha ağırdır)
  const mass = c.hollow ? surface * wallM * mat.density * shoulderExtra : vol * mat.density;
  const cost = length * mat.pricePerMeter * 0.8;
  return { massKg: mass, cg: profile.cpK * length, cost, note: "Burun konisi" };
}

/** Kanat planform alanı (tek kanat), m². */
export function finPlanformArea(f: FinConfig): number {
  const cr = f.rootChordM;
  const ct = f.tipChordM;
  const s = f.semispanM;
  switch (f.geometry) {
    case "rectangular":
    case "swept":
      return ((cr + ct) / 2) * s;
    case "clippedDelta":
    case "delta":
      return (cr * s) / 2 + ((ct * s) / 2) * 0.5; // delta: üçgen; clipped: küçük dikdörtgen
    case "elliptical":
      return (PI / 4) * cr * s;
    case "rounded":
      return ((cr + ct) / 2) * s * 1.05;
    default:
      return ((cr + ct) / 2) * s;
  }
}

export function finMass(f: FinConfig): ComponentMass {
  const mat = FIN_MATERIALS[f.material] ?? FIN_MATERIALS.balsa;
  const area = finPlanformArea(f);
  const mass = area * f.thicknessM * mat.density * f.count;
  const cost = area * f.count * mat.pricePerMeter * 2;
  return { massKg: mass, cg: f.xPosM + f.rootChordM / 2, cost, note: `Kanatlar (${f.count})` };
}

export function recoveryMass(r: RecoveryConfig): ComponentMass {
  let mass = 0;
  let cost = 0;
  const mat = CANOPY_MATERIALS[r.material] ?? CANOPY_MATERIALS.plastic;
  if (r.type === "parachute") {
    const area = PI * (r.diameterM / 2) ** 2;
    mass = area * mat.density / 1000 * 1.35; // kanopi + hatlar
    cost = area * mat.price * 8;
    if (r.drogueDiaM > 0) {
      const dArea = PI * (r.drogueDiaM / 2) ** 2;
      mass += dArea * mat.density / 1000 * 1.2;
      cost += dArea * mat.price * 8;
    }
  } else if (r.type === "streamer") {
    const area = r.diameterM * r.diameterM * 3; // şerit alanı
    mass = area * mat.density / 1000 * 1.1;
    cost = area * mat.price * 5;
  } else if (r.type === "tumble") {
    mass = 0.002;
    cost = 0;
  }
  // Şok ipi: ~0.5 g/m
  mass += r.shockCordM * 0.0005;
  cost += r.shockCordM * 1.5;
  return { massKg: mass, cg: 0.5, cost, note: "Kurtarma sistemi" };
}

export const AVIONICS: Record<AvionicsId, { mass: number; cost: number; name: string; apogeeDetect: boolean }> = {
  none: { mass: 0, cost: 0, name: "Yok", apogeeDetect: false },
  altimeter: { mass: 0.008, cost: 350, name: "Altimetre", apogeeDetect: true },
  barometer: { mass: 0.004, cost: 250, name: "Barometre", apogeeDetect: true },
  gps: { mass: 0.015, cost: 600, name: "GPS", apogeeDetect: false },
  flightComputer: { mass: 0.025, cost: 1200, name: "Uçuş Bilgisayarı", apogeeDetect: true },
};

export function payloadMass(p: PayloadConfig): ComponentMass {
  const av = AVIONICS[p.avionics];
  const mass = (p.hasPayload ? p.cargoKg : 0) + av.mass;
  const cost = av.cost;
  return { massKg: mass, cg: 0.9, cost, note: av.name };
}

// ---------------------------------------------------------------------------
// Kademe ve tam roket montajı
// ---------------------------------------------------------------------------

/** Bir kademenin parçalarını kütle merkezleriyle toplar (kademenin burnu referans). */
function assembleStageParts(stage: StageConfig, motorSpecs: MotorSpec[]): { parts: ComponentMass[]; mass: number; cg: number; cost: number } {
  const bm = bodyMass(stage.body);
  const noseLen = stage.nose.lengthCalibers * stage.body.diameterM;
  const nm = noseMass(stage.nose, stage.body.diameterM, stage.body.wallM);
  const fm = finMass(stage.fins);
  const rm = recoveryMass(stage.recovery);
  const pm = payloadMass(stage.payload);
  // Motor: gövdenin içinde, motor uzunluğunun ~%80'i tüpte (lüle dışarıda)
  const motorMass = motorSpecs.reduce((s, m) => s + m.mass, 0);
  const motorInTube = motorSpecs.length > 0
    ? Math.min(motorSpecs[0].length - 0.012, stage.body.lengthM * 0.6)
    : 0.02;
  const motorCg = stage.body.lengthM - motorInTube / 2;
  // İmalat payı: yapıştırıcı, rampa pabucu, wadding, boya zırhı
  const construction: ComponentMass = {
    massKg: 0.0035,
    cg: noseLen + stage.body.lengthM * 0.15,
    cost: 3,
    note: "İmalat parçaları",
  };

  const items: Array<{ part: ComponentMass; cg: number }> = [
    { part: bm, cg: bm.cg },
    { part: nm, cg: nm.cg },
    { part: fm, cg: fm.cg },
    // Kurtarma yükü burun bölmesinde istiflenir
    { part: rm, cg: noseLen + 0.03 },
    { part: pm, cg: noseLen + 0.08 },
    { part: { massKg: motorMass, cg: motorCg, cost: motorSpecs.reduce((s, m) => s + m.price, 0), note: "Motor" }, cg: motorCg },
    { part: construction, cg: construction.cg },
  ];
  let mass = 0;
  let moment = 0;
  let cost = 0;
  for (const it of items) {
    mass += it.part.massKg;
    moment += it.part.massKg * it.cg;
    cost += it.part.cost;
  }
  const cg = mass > 1e-9 ? moment / mass : 0;
  return { parts: items.map((i) => i.part), mass, cg, cost };
}

/** Kademeleri istifler: 0. kademe en üstte. */
export function assembleRocket(config: RocketConfig): RocketAssembly {
  const n = config.stages.length;
  // Kademe geometrisi: en üst kademe en dar olur (yukarı doğru daralan)
  // Kullanıcı çapları serbest; referans çap en büyük.
  let diameter = 0;
  let totalLength = 0;
  const stageLengths: number[] = [];
  const stageTops: number[] = []; // stack tipinden (en üst burnun ucu) itibaren
  const stageMasses: number[] = [];
  const motorInstances: MotorInstance[] = [];

  // Kademe alt sınırlarını hesapla (üstten alta)
  const noseLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = config.stages[i];
    const noseLen = s.nose.lengthCalibers * s.body.diameterM;
    noseLengths.push(noseLen);
    const len = noseLen + s.body.lengthM;
    stageLengths.push(len);
    totalLength += len;
    diameter = Math.max(diameter, s.body.diameterM);
  }
  let pos = 0;
  for (let i = 0; i < n; i++) {
    stageTops.push(pos);
    pos += stageLengths[i];
  }
  // Booster (strapon) uzunluk: ilk kademe gövdesine paralel
  const boosterLen = config.stages[0].body.lengthM * 0.85;

  // Kütleleri topla
  let liftoffMass = 0;
  let dryMass = 0;
  let cost = 0;
  let propMass = 0;
  let cgStackTip = 0;
  const stackMassItems: Array<{ mass: number; cg: number }> = [];

  for (let i = 0; i < n; i++) {
    const s = config.stages[i];
    const specs = resolveMotor(s.motor.choice);
    const { mass, cg, cost: c } = assembleStageParts(s, specs);
    const top = stageTops[i];
    stageMasses.push(mass);
    liftoffMass += mass;
    dryMass += mass - specs.reduce((a, m) => a + m.propellant, 0);
    cost += c;
    propMass += specs.reduce((a, m) => a + m.propellant, 0);
    // Motorların stack-tipine göre konumu
    for (const sp of specs) {
      motorInstances.push({ spec: sp, cg: top + noseLengths[i] + s.body.lengthM - sp.length / 2 });
    }
    stackMassItems.push({ mass, cg: top + cg });
  }

  // Booster'lar (ilk kademe gövdesine bağlı)
  const boosterMasses: number[] = [];
  if (config.boosterCount > 0) {
    const bSpecs = resolveMotor(config.boosterMotor.choice);
    const bMass = bSpecs.reduce((a, m) => a + m.mass, 0) + 0.02; // + bağlantı
    for (let i = 0; i < config.boosterCount; i++) {
      boosterMasses.push(bMass);
      liftoffMass += bMass;
      dryMass += bMass - bSpecs.reduce((a, m) => a + m.propellant, 0);
      cost += bSpecs.reduce((a, m) => a + m.price, 0) + 10;
      propMass += bSpecs.reduce((a, m) => a + m.propellant, 0);
      // Booster CG: ilk kademenin gövdesinin ortası hizasında
      const s0 = config.stages[0];
      const top0 = stageTops[0] + noseLengths[0];
      stackMassItems.push({ mass: bMass, cg: top0 + s0.body.lengthM * 0.5 });
      for (const sp of bSpecs) {
        motorInstances.push({ spec: sp, cg: top0 + s0.body.lengthM - sp.length / 2 });
      }
    }
  }

  cgStackTip = stackMassItems.reduce((m, it) => m + it.mass * it.cg, 0) / Math.max(liftoffMass, 1e-9);

  // ---- CP (Barrowman) ----
  // Bileşenler: en üst kademenin burnu, tüm gövdeler, çaplar arası geçişler, ilk kademenin kanatları
  const bparts: Array<{ cn: number; x: number }> = [];
  const topStage = config.stages[0];
  const topDia = topStage.body.diameterM;
  const topNoseLen = noseLengths[0];
  const noseProfile = makeProfile(topStage.nose.profile);
  bparts.push(barrowmanNose(noseProfile.cpK, topNoseLen));
  // Gövde (hacim yöntemi)
  let bodyVol = 0;
  let bodyLenTotal = 0;
  for (let i = 0; i < n; i++) {
    const s = config.stages[i];
    const r = s.body.diameterM / 2;
    bodyVol += PI * r * r * s.body.lengthM;
    bodyLenTotal += s.body.lengthM;
  }
  const refArea = PI * (topDia / 2) ** 2;
  bparts.push(barrowmanBody(topNoseLen + bodyLenTotal, bodyVol, refArea));
  // Geçişler: kademe çapları farklıysa.
  // Eklem (üst kademe gövdesinin dibi = alt kademenin burun ucu) stageTops[i]'de.
  // Burun ucundan analiz: ön (üst, küçük) çap = üst kademe, arka (alt, büyük) çap = alt kademe.
  for (let i = 1; i < n; i++) {
    const prev = config.stages[i - 1];
    const cur = config.stages[i];
    if (Math.abs(prev.body.diameterM - cur.body.diameterM) > 1e-6) {
      bparts.push(barrowmanTransition(stageTops[i], 0.03, prev.body.diameterM, cur.body.diameterM));
    }
  }
  // Kanatlar: ilk kademe (en alttaki uçuş kademesi kanat taşır)
  const finStageIdx = n - 1;
  const fStage = config.stages[finStageIdx];
  const fNoseLen = noseLengths[finStageIdx];
  if (fStage.fins.count > 0) {
    const f = fStage.fins;
    const sweepX = f.sweepDeg > 0 ? Math.tan((f.sweepDeg * PI) / 180) * f.semispanM : 0;
    const xRoot = stageTops[finStageIdx] + fNoseLen + f.xPosM;
    const finGeom: FinGeometry = {
      rootChord: f.rootChordM,
      tipChord: f.tipChordM,
      semispan: f.semispanM,
      sweep: sweepX,
      count: f.count,
      bodyRadius: fStage.body.diameterM / 2,
      xRoot,
    };
    const fin = barrowmanFins(finGeom);
    bparts.push({ cn: fin.cn, x: fin.x });
  }
  const barrow = combineBarrowman(bparts);
  const cpM = barrow.cp;
  const stabilityCal = (cpM - cgStackTip) / Math.max(diameter, 1e-9);

  // ---- İtki/ağırlık ----
  const totalThrust = config.stages.reduce((a, s) => a + stageThrust(s.motor, 1), 0) +
    (config.boosterCount > 0 ? stageThrust(config.boosterMotor, 1) * config.boosterCount : 0);
  const twr = totalThrust / (liftoffMass * 9.80665);

  // ---- Sürükleme parametreleri ----
  let wetted = 0;
  for (let i = 0; i < n; i++) {
    const s = config.stages[i];
    const r = s.body.diameterM / 2;
    const L = s.body.lengthM;
    wetted += PI * s.body.diameterM * L; // silindir
    const nl = noseLengths[i];
    const prof = makeProfile(s.nose.profile);
    wetted += PI * r * Math.sqrt(r * r + nl * nl) * prof.surfaceFactor; // koni yaklaşımı
    wetted += finPlanformArea(s.fins) * 2 * s.fins.count;
  }
  if (config.boosterCount > 0) {
    wetted += config.boosterCount * (PI * 0.04 * boosterLen + 0.01);
  }
  const refA = PI * (diameter / 2) ** 2;
  const charL = totalLengthM(totalLength);
  const finPlanformFactor = { rectangular: 1.0, swept: 1.02, clippedDelta: 0.98, elliptical: 0.9, delta: 1.05, rounded: 1.0 }[fStage.fins.geometry] ?? 1;
  const finCountPenalty = { 0: 0, 3: 0.02, 4: 0.04, 5: 0.06, 6: 0.08 }[fStage.fins.count] ?? 0.02;
  const mat = MATERIALS[topStage.body.material] ?? MATERIALS.kraft;
  const excrescence = topStage.body.paint ? 0.01 : 0.03;
  const drag = dragSubsonic({
    area: refA,
    wettedArea: wetted,
    charLength: charL,
    surfaceFactor: mat.roughness,
    finPlanformFactor,
    finCountPenalty,
    noseWaveFactor: noseProfile.waveDragFactor,
    excrescence,
    rho: 1.225,
    mu: 1.716e-5,
    velocity: 25,
  });

  return {
    config,
    totalLengthM: totalLength,
    diameterM: diameter,
    liftoffMassKg: liftoffMass,
    dryMassKg: dryMass,
    cgM: cgStackTip,
    cpM,
    stabilityCal,
    twr,
    cost,
    refAreaM2: refA,
    wettedAreaM2: wetted,
    charLengthM: charL,
    cdSubsonic: drag.cdSubsonic,
    motorInstances,
    stageTops,
    stageMasses,
    boosterMasses,
    propellantMassKg: propMass,
  };
}

function totalLengthM(total: number): number {
  return Math.max(total, 0.1);
}

/** Paraşüt açık iniş hızı (terminal hız yaklaşımı): v = sqrt(2mg/(ρ·Cd·A)). */
export function landingSpeed(massKg: number, diaM: number, cd = 0.78, rho = 1.225): number {
  if (diaM <= 0) return 0;
  const A = PI * (diaM / 2) ** 2;
  return Math.sqrt((2 * massKg * 9.80665) / (rho * cd * A));
}

/**
 * İnen kısmın kütlesi: en üst kademenin kuru kütlesi (yakıtı bitmiş).
 * Çok kademeli roketlerde alt kademeler uçuşta düşer — iniş hızı hesabı
 * kalkış kütlesini değil bunu kullanmalı.
 */
export function landingMassKg(a: RocketAssembly): number {
  const top = a.config.stages[0];
  const topProp = resolveMotor(top.motor.choice).reduce((s, m) => s + m.propellant, 0);
  return Math.max(a.stageMasses[0] - topProp, 0.001);
}

export { makeProfile, averageThrust, motorThrustCurve, classMid };
