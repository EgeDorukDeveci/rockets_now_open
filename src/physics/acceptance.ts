// Ortak kabul eşikleri: casual ve tech modların aynı kurallrı paylaşması.
// Tüm eşikler tek kaynakta; UI (MetricsPanel) ve simülasyon çıktıları buradan okur.

import { classFromImpulse } from "./motors/types";

/** Stabilite marjı: bu üstünde tasarım "STABİL" sayılır (kalibre cinsinden). */
export const GOOD_STABILITY_CALIBERS = 1.0;
/** Stabilite marjı: bu altında tasarım "İSTİKRARSIZ" sayılır. */
export const MIN_STABILITY_CALIBERS = 0.5;
/** İniş hızı: bu üstündeyse kurtarma yetersiz kabul edilir (m/s). */
export const MAX_LANDING_VEL_MPS = 14;
/** Kalkış itki/ağırlık oranı alt sınırı (NAR/Estes önerisi: 2 minimum). */
export const MIN_TWR = 2.0;

export type AcceptanceSeverity = "ok" | "warn" | "bad";

export interface AcceptanceCheck {
  key: string;
  label: string;
  /** "ok" = geçer, "warn" = sınırda, "bad" = kabul edilmez */
  severity: AcceptanceSeverity;
  message: string;
}

export interface AcceptanceInput {
  /** (CP - CG) / referans çap, kalibre */
  stabilityCalibers: number;
  /** Kalkış itki/ağırlık oranı */
  twr: number;
  /** İniş hızı, m/s; uçuş yoksa null */
  landingVelMps: number | null;
  /** Apogee, m (zemin üstü) */
  apogeeM: number;
  /** Motor sınıfı impulsu, Ns (sınıf bandı apogee kılavuzu için) */
  motorTotalImpulse: number;
}

/** Sınıf bandı apogee kılavuzu (Estes tipik lanse değerleri; dar band yok). */
export function expectedApogeeRange(totalImpulse: number): [number, number] {
  const cls = classFromImpulse(totalImpulse);
  switch (cls) {
    case "A": return [30, 120];
    case "B": return [60, 190];
    case "C": return [120, 380];
    case "D": return [200, 520];
    case "E": return [300, 750];
    case "F": return [450, 1100];
    case "G": return [600, 1700];
    default: return [10, 4000];
  }
}

/** Tasarımı ortak kurallarla değerlendirir; her kural "ok"/"warn"/"bad" döner. */
export function checkAcceptance(inp: AcceptanceInput): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];

  const stab = inp.stabilityCalibers;
  checks.push(
    stab >= GOOD_STABILITY_CALIBERS
      ? { key: "stability", label: "Stabilite", severity: "ok", message: `${stab.toFixed(2)} kalibre — STABİL` }
      : stab >= MIN_STABILITY_CALIBERS
        ? { key: "stability", label: "Stabilite", severity: "warn", message: `${stab.toFixed(2)} kalibre — SINIRDA` }
        : { key: "stability", label: "Stabilite", severity: "bad", message: `${stab.toFixed(2)} kalibre — İSTİKRARSIZ` },
  );

  checks.push(
    inp.twr >= MIN_TWR
      ? { key: "twr", label: "İtki/ağırlık", severity: "ok", message: `${inp.twr.toFixed(1)} — kalkış yeterli` }
      : { key: "twr", label: "İtki/ağırlık", severity: "bad", message: `${inp.twr.toFixed(1)} — ${MIN_TWR} altında, kalkış riskli` },
  );

  checks.push({
    key: "landing",
    label: "İniş hızı",
    severity: inp.landingVelMps === null || inp.landingVelMps <= MAX_LANDING_VEL_MPS ? "ok" : "bad",
    message: inp.landingVelMps === null
      ? "Uçuş yok — motorsuz roket"
      : `${inp.landingVelMps.toFixed(1)} m/s — ${inp.landingVelMps <= MAX_LANDING_VEL_MPS ? "yumuşak iniş" : `${MAX_LANDING_VEL_MPS} m/s üstünde, çakılma riski`}`,
  });

  const [lo, hi] = expectedApogeeRange(inp.motorTotalImpulse);
  checks.push(
    inp.apogeeM >= lo && inp.apogeeM <= hi
      ? { key: "apogee", label: "Apogee", severity: "ok", message: `${inp.apogeeM.toFixed(0)} m — sınıf beklenen aralıkta (${lo}–${hi} m)` }
      : { key: "apogee", label: "Apogee", severity: "warn", message: `${inp.apogeeM.toFixed(0)} m — sınıf beklenen aralığın dışında (${lo}–${hi} m)` },
  );

  return checks;
}