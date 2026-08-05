// Uçuş olayları — timeline ve durum makinesi olayları.

export type FlightEventId =
  | "preflight"
  | "ignition"
  | "liftoff"
  | "railExit"
  | "maxQ"
  | "mach09"
  | "mach1"
  | "mach11"
  | "burnout"
  | "boosterSep"
  | "stageSep"
  | "apogee"
  | "drogueDeploy"
  | "mainDeploy"
  | "deploy"
  | "touchdown"
  | "crash"
  | "shred"
  | "abort";

export interface FlightEvent {
  id: FlightEventId;
  t: number;
  altM: number;
  velMps: number;
  mach: number;
  message: string;
}

export function eventLabel(id: FlightEventId): string {
  switch (id) {
    case "preflight": return "ÖN UÇUŞ";
    case "ignition": return "ATEŞLEME";
    case "liftoff": return "KALKIŞ";
    case "railExit": return "RAY ÇIKIŞI";
    case "maxQ": return "MAX-Q";
    case "mach09": return "MACH 0.9";
    case "mach1": return "MACH 1";
    case "mach11": return "MACH 1.1";
    case "burnout": return "MOTOR SÖNÜMÜ";
    case "boosterSep": return "BOOSTER AYRIMI";
    case "stageSep": return "KADEME AYRIMI";
    case "apogee": return "APOGEE";
    case "drogueDeploy": return "DROGUE AÇILDI";
    case "mainDeploy": return "ANA PARAŞÜT";
    case "deploy": return "PARAŞÜT AÇILDI";
    case "touchdown": return "İNİŞ";
    case "crash": return "ÇAKILMA";
    case "shred": return "PARÇALANMA";
    case "abort": return "İPTAL";
    default: return id;
  }
}
