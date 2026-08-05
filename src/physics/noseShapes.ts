// Burun konisi profilleri.
// Fizik: CP katsayıları Barrowman (NARAM-8) ve Van Milligan'ın
// "Model Rocket Design and Construction" kitabındaki yaygın değerler.
// Kaynak: rocketmime.com/rockets/Barrowman.html (koni 0.666, ogive 0.466).

import { PI } from "./constants";

export type NoseProfileId =
  | "conical"
  | "tangentOgive"
  | "secantOgive"
  | "parabolic"
  | "vonKarman"
  | "power"
  | "blunt";

/** Profil değerlendirme parametreleri. */
export interface ProfileParams {
  /** İncelik oranı: burun uzunluğu / yarıçap (L/R) */
  fineness: number;
  /** Güç serisi üssü */
  powerN: number;
  /** Küt burun oranı (0-0.35) */
  bluntness: number;
  /** Secant ogive rho çarpanı */
  secantK: number;
}

export interface NoseProfile {
  id: NoseProfileId;
  name: string;
  /** Barrowman CP konumu: XN = k·LN (burun ucundan) */
  cpK: number;
  /** Süpersonik dalga sürüklemesi cezası (1.0 = koni seviyesi) */
  waveDragFactor: number;
  /** Malzeme alanı hesabı için kaba yüzey katsayısı (silindire göre) */
  surfaceFactor: number;
  /** 3D lathe profili: y = radius(x/L), x/L ∈ [0,1] */
  profile: (t: number, p: ProfileParams) => number;
}

/** Güç serisi: y = R·(x/L)^n */
function powerSeries(t: number, n: number): number {
  return Math.pow(Math.max(t, 0), n);
}

export function makeProfile(id: NoseProfileId): NoseProfile {
  const p: NoseProfile = {
    id,
    name: "",
    cpK: 0.5,
    waveDragFactor: 1.0,
    surfaceFactor: 1.0,
    profile: () => 0,
  };
  switch (id) {
    case "conical":
      p.name = "Konik";
      p.cpK = 0.666; // Barrowman: koni XN = 0.666·LN
      p.waveDragFactor = 1.0; // süpersonikte en kötü
      p.surfaceFactor = 1.0;
      p.profile = (t) => t;
      break;
    case "tangentOgive":
      p.name = "Tangent Ogive";
      p.cpK = 0.466; // Barrowman: ogive XN = 0.466·LN
      p.waveDragFactor = 0.82;
      p.surfaceFactor = 1.02;
      p.profile = (t, pr) => {
        // rho = (R² + L²)/(2R); normalize: fr = L/R → rho/R = (fr² + 1)/2
        // y(x) = sqrt(rho² - (L-x)²) + R - rho;  (L-x) = fr·(1-t)·R
        const fr = Math.max(pr.fineness, 0.5);
        const rho = (1 + fr * fr) / 2;
        return Math.sqrt(Math.max(rho * rho - fr * fr * Math.pow(1 - t, 2), 0)) + 1 - rho;
      };
      break;
    case "secantOgive":
      p.name = "Secant Ogive";
      p.cpK = 0.5;
      p.waveDragFactor = 0.9;
      p.surfaceFactor = 1.02;
      p.profile = (t, pr) => {
        const fr = Math.max(pr.fineness, 0.5);
        const rhoT = (1 + fr * fr) / 2;
        const rho = rhoT * pr.secantK;
        // daire merkezi ötelemesi: y(L)=1 → d = rho - 1
        const y = Math.sqrt(Math.max(rho * rho - fr * fr * Math.pow(1 - t, 2), 0)) - (rho - 1);
        return Math.max(y, 0);
      };
      break;
    case "parabolic":
      p.name = "Parabolik";
      p.cpK = 0.5;
      p.waveDragFactor = 0.78;
      p.surfaceFactor = 1.03;
      p.profile = (t) => Math.sqrt(t); // güç serisi n=0.5 (sivri uç)
      break;
    case "vonKarman":
      p.name = "von Karman (LD-Haack)";
      p.cpK = 0.437; // Van Milligan: LV-Haack ~0.437·LN
      p.waveDragFactor = 0.68; // teorik optimum
      p.surfaceFactor = 1.04;
      p.profile = (t) => {
        const theta = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t)));
        return Math.sqrt((theta - Math.sin(2 * theta) / 2) / PI);
      };
      break;
    case "power":
      p.name = "Güç Serisi (n değişken)";
      p.cpK = 0.5;
      p.waveDragFactor = 0.72 + 0.28 * 0.5; // n=0.5 varsayımı
      p.surfaceFactor = 1.03;
      p.profile = (t, pr) => powerSeries(t, Math.max(0.2, Math.min(1, pr.powerN)));
      break;
    case "blunt":
      p.name = "Küt Burun";
      p.cpK = 0.5;
      p.waveDragFactor = 1.15; // süpersonik eğitim amaçlı — yüksek dalga sürüklemesi
      p.surfaceFactor = 1.05;
      p.profile = (t, pr) => {
        // Ucu küresel kapakla kesilmiş güç serisi n=0.5
        const b = Math.max(pr.bluntness, 0.02);
        const xBlunt = b * 2.4;
        if (t < xBlunt) {
          const u = 1 - t / xBlunt;
          return Math.max(powerSeries(t, 0.5) + b * (1 - Math.sqrt(1 - u * u)), 0);
        }
        return powerSeries(t, 0.5);
      };
      break;
  }
  return p;
}

export const NOSE_PROFILES: NoseProfile[] = [
  makeProfile("conical"),
  makeProfile("tangentOgive"),
  makeProfile("secantOgive"),
  makeProfile("parabolic"),
  makeProfile("vonKarman"),
  makeProfile("power"),
  makeProfile("blunt"),
];

export function getProfile(id: NoseProfileId): NoseProfile {
  return NOSE_PROFILES.find((p) => p.id === id) ?? NOSE_PROFILES[0];
}
