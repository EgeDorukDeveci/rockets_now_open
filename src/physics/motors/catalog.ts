// Motor kataloğu.
// Estes motorları doğrulanmış verilerle (kaynak: estesrockets.com,
// thrustcurve.org, apogeerockets.com, Estes Engine Chart PDF — Ağustos 2026 araştırması):
//   C6-7: 8.8-10.0 Ns, max 14.1-15.3 N, 1.6-1.9 s, 24.2 g, 10.8-12.2 g yakıt, 18 mm
//   D12-5: 16.8-20.0 Ns, max 29.7-32.9 N, 1.6-1.7 s, 45.2-45.6 g, 21.1-24.2 g yakıt, 24 mm
//   B6-4: 4.3 Ns, max 12.1 N, 0.9 s, 19.1 g / 5.6 g
//   A8-3: 2.3 Ns, max 9.7 N, 0.7 s, 16.7 g / 3.3 g
// Sıvı motor Isp değerleri: Merlin 1D (RP-1) 282/311, RL-10 (LH2) 366/452, Raptor (CH4) 330/380.
// APCP: Isp ~180-240 s (Aerotech sınıfı). Hibrit N2O+parafin: ~250-300 s.
// NAR sınıf aralıkları: A 1.26-2.5, B 2.51-5, C 5.01-10, D 10.01-20, E 20.01-40, F 40.01-80,
// G 80.01-160, H 160.01-320, I 320.01-640, J 640.01-1280, K 1280.01-2560 (N·s).

import { MotorSpec, MotorTypeId, classFromImpulse } from "./types";

const ESTES_ISP = 82; // black powder tipik Isp ~80-90 s
const APCP_ISP = 210; // kompozit tipik

export const ESTES_MOTORS: MotorSpec[] = [
  {
    id: "A8-3",
    name: "Estes A8-3",
    type: "blackPowder",
    totalImpulse: 2.3,
    burnTime: 0.7,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.0167,
    propellant: 0.0033,
    delay: 3,
    diameter: 0.018,
    length: 0.07,
    price: 40,
    grain: "endBurn",
    throttleable: false,
    classLabel: "A",
    source: "Apogee: A8-3 2.3 Ns, max 9.7 N, 0.7 s, 16.7 g / 3.3 g",
  },
  {
    id: "B6-4",
    name: "Estes B6-4",
    type: "blackPowder",
    totalImpulse: 4.3,
    burnTime: 0.9,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.0191,
    propellant: 0.0056,
    delay: 4,
    diameter: 0.018,
    length: 0.07,
    price: 45,
    grain: "endBurn",
    throttleable: false,
    classLabel: "B",
    source: "Apogee: B6-4 4.3 Ns, max 12.1 N, 0.9 s, 19.1 g / 5.6 g",
  },
  {
    id: "C6-5",
    name: "Estes C6-5",
    type: "blackPowder",
    totalImpulse: 8.8,
    burnTime: 1.9,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.024,
    propellant: 0.0108,
    delay: 5,
    diameter: 0.018,
    length: 0.07,
    price: 55,
    grain: "endBurn",
    throttleable: false,
    classLabel: "C",
    source: "ThrustCurve/Estes: C6 8.8 Ns, 4.7 N avg, 14.1 N max, 1.9 s",
  },
  {
    id: "C6-7",
    name: "Estes C6-7",
    type: "blackPowder",
    totalImpulse: 8.8,
    burnTime: 1.9,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.0242,
    propellant: 0.0108,
    delay: 7,
    diameter: 0.018,
    length: 0.07,
    price: 55,
    grain: "endBurn",
    throttleable: false,
    classLabel: "C",
    source: "Apogee/Estes: C6-7 8.8 Ns, max 14.1 N, 1.9 s, 24.2 g / 10.8 g, 7 s delay",
  },
  {
    id: "D12-5",
    name: "Estes D12-5",
    type: "blackPowder",
    totalImpulse: 18,
    burnTime: 1.65,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.0454,
    propellant: 0.023,
    delay: 5,
    diameter: 0.024,
    length: 0.07,
    price: 75,
    grain: "endBurn",
    throttleable: false,
    classLabel: "D",
    source: "Estes/ThrustCurve: D12 16.8-20 Ns, max 29.7-32.9 N, 1.6-1.7 s, ~45 g / ~23 g",
  },
  {
    id: "E9-6",
    name: "Estes E9-6",
    type: "blackPowder",
    totalImpulse: 30,
    burnTime: 3.3,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.062,
    propellant: 0.037,
    delay: 6,
    diameter: 0.024,
    length: 0.09,
    price: 110,
    grain: "endBurn",
    throttleable: false,
    classLabel: "E",
    source: "Estes E9: ~30 Ns, ~9 N avg, 24 mm",
  },
  {
    id: "E12-6",
    name: "Estes E12-6",
    type: "blackPowder",
    totalImpulse: 35,
    burnTime: 2.1,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.07,
    propellant: 0.043,
    delay: 6,
    diameter: 0.024,
    length: 0.09,
    price: 130,
    grain: "endBurn",
    throttleable: false,
    classLabel: "E",
    source: "Estes E12: ~35 Ns, ~17 N avg, 24 mm",
  },
  {
    id: "F15-6",
    name: "Estes F15-6",
    type: "blackPowder",
    totalImpulse: 55,
    burnTime: 3.3,
    isp: ESTES_ISP,
    ispVacuum: ESTES_ISP,
    mass: 0.105,
    propellant: 0.068,
    delay: 6,
    diameter: 0.029,
    length: 0.11,
    price: 170,
    grain: "endBurn",
    throttleable: false,
    classLabel: "F",
    source: "Estes F15: ~55 Ns, ~17 N avg, 29 mm",
  },
];

/** APCP kompozit katı motor (sınıf + ort. itki + gecikme seçimli). */
export function makeApcpMotor(
  className: string,
  avgThrustN: number,
  delay: number,
  itNs: number,
  isp = APCP_ISP,
  grain: MotorSpec["grain"] = "bates",
): MotorSpec {
  const burn = itNs / avgThrustN;
  const prop = itNs / (isp * 9.80665);
  // kasa ağırlığı: yakıtın ~%45-65'i (kompozit motorlarda karbon/karton kasa)
  const casing = prop * 0.55;
  const dia = itNs <= 40 ? 0.029 : itNs <= 160 ? 0.038 : itNs <= 640 ? 0.054 : 0.075;
  const len = Math.max(0.08, (prop + casing) / (Math.PI * (dia / 2) ** 2 * 1200));
  return {
    id: `${className}${Math.round(avgThrustN)}-${delay}W`,
    name: `APCP ${className}${Math.round(avgThrustN)}-${delay}`,
    type: "apcp",
    totalImpulse: itNs,
    burnTime: burn,
    isp,
    ispVacuum: isp + 8,
    mass: prop + casing,
    propellant: prop,
    delay,
    diameter: dia,
    length: len,
    price: itNs * 3.5 + 100,
    grain,
    throttleable: false,
    classLabel: className,
    source: `APCP kompozit: Isp ~${isp} s (Aerotech sınıfı), ${classFromImpulse(itNs)} itki`,
  };
}

/** Teknik mod APCP id şeması (örn. "G30-7W") için sınıf → toplam itki eşlemesi. */
const APCP_TECH_IMPULSE: Record<string, number> = {
  A: 1.9, B: 4, C: 8, D: 14, E: 30, F: 60, G: 120,
};

/** Teknik mod motor seçicilerinde sunulan APCP kataloğu (A–G). */
export const TECH_APCP_MOTORS: MotorSpec[] = [
  makeApcpMotor("A", 8, 3, 1.9),
  makeApcpMotor("B", 10, 4, 4),
  makeApcpMotor("C", 12, 6, 8),
  makeApcpMotor("D", 16, 4, 14),
  makeApcpMotor("E", 20, 5, 30),
  makeApcpMotor("F", 24, 6, 60),
  makeApcpMotor("G", 30, 7, 120),
];

/** "G30-7W" biçimindeki teknik mod motor id'sini katalog motoruna çevirir; uyumsuzsa null. */
export function apcpMotorFromId(id: string): MotorSpec | null {
  const m = /^([A-G])(\d+)-(\d+)W$/.exec(id);
  if (!m) return null;
  const [, cls, thrust, delay] = m;
  const it = APCP_TECH_IMPULSE[cls];
  if (it === undefined) return null;
  return makeApcpMotor(cls, Number(thrust), Number(delay), it);
}

export type LiquidFuel = "LOX/RP-1" | "LOX/LH2" | "LOX/CH4";

export interface LiquidMotorSpec extends MotorSpec {
  fuel: LiquidFuel;
  /** Kuru kütle oranı (tank+motor+yapı) */
  dryMassFraction: number;
}

/**
 * Sıvı motor (tank + motor) — kullanıcı tanımlı itki ve kütle.
 * Kaynak Isp: Merlin 1D 282/311, RL-10 366/452, Raptor 330/380 (kaynak: SpaceX/Rocketdyne/NASA).
 */
export function makeLiquidMotor(
  fuel: LiquidFuel,
  name: string,
  thrustN: number,
  propMass: number,
  dryFraction = 0.11,
): LiquidMotorSpec {
  let isp: number, ispVac: number, type: MotorTypeId;
  if (fuel === "LOX/RP-1") {
    isp = 282; ispVac = 311; type = "liquidLoxRp1";
  } else if (fuel === "LOX/LH2") {
    isp = 366; ispVac = 452; type = "liquidLoxLh2";
  } else {
    isp = 330; ispVac = 380; type = "liquidLoxCh4";
  }
  const mdot = thrustN / (isp * 9.80665);
  const burn = propMass / mdot;
  const dry = propMass * (dryFraction / (1 - dryFraction));
  const dia = 0.11 + 0.06 * Math.log10(1 + thrustN / 1e4);
  return {
    id: `liq-${fuel}-${name}`,
    name: `${name} (${fuel})`,
    type,
    totalImpulse: thrustN * burn,
    burnTime: burn,
    isp,
    ispVacuum: ispVac,
    mass: propMass + dry,
    propellant: propMass,
    delay: 0,
    diameter: dia,
    length: Math.max(1.2, propMass / (Math.PI * (dia / 2) ** 2 * 450)),
    price: thrustN * 8 + propMass * 200,
    throttleable: true,
    classLabel: undefined,
    source: `Isp ${isp} sl / ${ispVac} vakum (${fuel})`,
    fuel,
    dryMassFraction: dryFraction,
  };
}

/** Hibrit N2O + parafin motor (kısılabilir). Isp ~250-300 s (kaynak: SpaceDev/SEDS literatürü). */
export function makeHybridMotor(name: string, avgThrustN: number, propMass: number): MotorSpec {
  const isp = 270;
  const mdot = avgThrustN / (isp * 9.80665);
  const burn = propMass / mdot;
  return {
    id: `hyb-${name}`,
    name,
    type: "hybrid",
    totalImpulse: avgThrustN * burn,
    burnTime: burn,
    isp,
    ispVacuum: isp + 12,
    mass: propMass * 1.7,
    propellant: propMass,
    delay: 0,
    diameter: 0.075,
    length: Math.max(0.6, propMass * 0.25),
    price: avgThrustN * 6 + 400,
    grain: "finocyl",
    throttleable: true,
    source: "Hibrit N2O/parafin: Isp ~250-300 s, kısılabilir",
  };
}

/** Soğuk gaz (eğitim). Isp ~55-70 s (kaynak: eğitim kitleri). */
export function makeColdGasMotor(thrustN: number, propMass: number): MotorSpec {
  const isp = 62;
  const mdot = thrustN / (isp * 9.80665);
  const burn = propMass / mdot;
  return {
    id: "coldgas-1",
    name: "Soğuk Gaz İtki",
    type: "coldGas",
    totalImpulse: thrustN * burn,
    burnTime: burn,
    isp,
    ispVacuum: isp + 5,
    mass: propMass * 1.9,
    propellant: propMass,
    delay: 0,
    diameter: 0.05,
    length: 0.3,
    price: 300,
    throttleable: true,
    source: "Soğuk gaz (CO2/N2): Isp ~60 s, çok düşük itki",
  };
}

/** Sınıf aralıkları (NAR). Kaynak: nar.org / Wikipedia "Model rocket motor classification". */
export const CLASS_RANGES: Record<string, [number, number]> = {
  "1/4A": [0.3126, 0.625],
  "1/2A": [0.626, 1.25],
  A: [1.26, 2.5],
  B: [2.51, 5.0],
  C: [5.01, 10.0],
  D: [10.01, 20.0],
  E: [20.01, 40.0],
  F: [40.01, 80.0],
  G: [80.01, 160.0],
  H: [160.01, 320.0],
  I: [320.01, 640.0],
  J: [640.01, 1280.0],
  K: [1280.01, 2560.0],
};

export const CLASS_ORDER = [
  "1/4A", "1/2A", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
] as const;

export type MotorClass = (typeof CLASS_ORDER)[number];

export function classMid(classLabel: string): number {
  const r = CLASS_RANGES[classLabel];
  if (!r) return 5;
  return Math.sqrt(r[0] * r[1]); // geometrik orta
}
