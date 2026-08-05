// Uçuş öncesi doğrulama ve uyarılar (doküman §6 "Uyarı sistemi").
// Stabilite: (CP−CG)/D ≥ 1 kalibre subsonik, ≥ 2 transonik/süpersonik (Barrowman kuralı).
// İniş hızı hedefi 4-6 m/s (doküman §3.6).
// Kanat sallanması (flutter) hız tahmini: Vf ≈ 1.8·sqrt(E/ρ)·(t/chord) (basitleştirilmiş).

import { FIN_MATERIALS } from "./materials";
import { landingMassKg, RocketAssembly, landingSpeed } from "./rocket";
import { PI } from "./constants";

export type WarningLevel = "error" | "warning" | "info";

export interface DesignWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export function validateRocket(a: RocketAssembly): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const cfg = a.config;
  const top = cfg.stages[0];
  const bottom = cfg.stages[cfg.stages.length - 1];
  const D = a.diameterM;

  // 1. Stabilite
  if (a.stabilityCal < 1.0) {
    warnings.push({
      level: a.stabilityCal < 0.5 ? "error" : "warning",
      code: "stability",
      message: `Stabilite marjı ${a.stabilityCal.toFixed(2)} kalibre — 1.0 kalibrenin altında. Kanatları büyütün veya CP'yi geriye alın.`,
    });
  } else if (a.stabilityCal < 1.5) {
    warnings.push({
      level: "warning",
      code: "stability",
      message: `Stabilite marjı ${a.stabilityCal.toFixed(2)} kalibre — sınırda. Transonik uçuş için ≥ 2 kalibre önerilir.`,
    });
  }
  if (bottom.fins.count === 0) {
    warnings.push({
      level: "error",
      code: "fins",
      message: "Kanatsız roket stabil değil! En az 3 kanat gerekir.",
    });
  }

  // 2. İtki/ağırlık oranı
  if (a.twr < 1.1) {
    warnings.push({
      level: "error",
      code: "twr",
      message: `İtki/ağırlık oranı ${a.twr.toFixed(2)} — roket raydan çıkamaz (≥ 1.1 gerekir).`,
    });
  } else if (a.twr < 1.5) {
    warnings.push({
      level: "warning",
      code: "twr",
      message: `İtki/ağırlık oranı ${a.twr.toFixed(2)} — sınırda; rüzgarlı günde zorlanır.`,
    });
  }

  // 3. İniş hızı (inen kısım = yakıtı bitmiş üst kademe)
  const rec = top.recovery;
  const landMass = landingMassKg(a);
  if (rec.type === "parachute" && rec.diameterM > 0) {
    const ls = landingSpeed(landMass, rec.diameterM);
    if (ls > 8) {
      warnings.push({
        level: "warning",
        code: "landing",
        message: `İniş hızı ≈ ${ls.toFixed(1)} m/s — hedef 4-6 m/s. Paraşütü büyütün.`,
      });
    }
    if (ls > 12) {
      warnings.push({
        level: "error",
        code: "landing",
        message: `İniş hızı ≈ ${ls.toFixed(1)} m/s — roket hasar riski yüksek.`,
      });
    }
  } else if (rec.type === "streamer") {
    const ls = landingSpeed(landMass, rec.diameterM * 0.24, 1.2);
    if (ls > 12) {
      warnings.push({
        level: "warning",
        code: "landing",
        message: `Streamer iniş hızı ≈ ${ls.toFixed(1)} m/s — sert iniş riski.`,
      });
    }
  } else if (rec.type === "tumble") {
    warnings.push({
      level: "warning",
      code: "landing",
      message: "Tumble kurtarma: iniş hızı yüksek olur, hasar riski.",
    });
  } else if (rec.type === "none") {
    warnings.push({
      level: "error",
      code: "recovery",
      message: "Kurtarma sistemi yok — roket çakılacak!",
    });
  }

  // 4. Kurtarma tetikleme uyumu
  if (rec.trigger === "apogee" && top.payload.avionics === "none") {
    warnings.push({
      level: "warning",
      code: "trigger",
      message: "Apogee algılama seçildi ama altimetre/aviyonik yok — gecikmeli açılış olacak.",
    });
  }
  if (rec.trigger === "delay" && top.motor.choice.kind === "liquid") {
    warnings.push({
      level: "warning",
      code: "trigger",
      message: "Sıvı motorlarda eject charge yok — gecikme yerine altimetre/zamanlayıcı kullanın.",
    });
  }

  // 5. Kanat sallanması (flutter) — tahmini tepe hıza karşı
  const f = bottom.fins;
  if (f.count > 0) {
    const finMat = FIN_MATERIALS[f.material] ?? FIN_MATERIALS.balsa;
    const chord = (f.rootChordM + f.tipChordM) / 2;
    const vf = 1.8 * Math.sqrt(finMat.modulus / finMat.density) * (f.thicknessM / Math.max(chord, 1e-6));
    if (a.predictedMaxVelMps > vf * 0.85) {
      warnings.push({
        level: "warning",
        code: "flutter",
        message: `Tahmini tepe hız (${a.predictedMaxVelMps.toFixed(0)} m/s) kanat sallanma hızına (${vf.toFixed(0)} m/s) yakın.`,
      });
    }
  }

  // 6. Ray çıkış hızı (öneri: ≥ 15 m/s)
  const railExitV = Math.sqrt(2 * 9.80665 * cfg.railM * Math.max(0, a.twr - 1) * a.liftoffMassKg / a.liftoffMassKg);
  if (a.twr > 1.05 && railExitV < 12) {
    warnings.push({
      level: "warning",
      code: "rail",
      message: `Ray çıkış hızı ≈ ${railExitV.toFixed(0)} m/s — rüzgarlı havada sorun çıkabilir (öneri ≥ 15 m/s).`,
    });
  }

  // 7. Boy/çap oranı (çok uzun roket)
  if (a.totalLengthM / D > 20) {
    warnings.push({
      level: "warning",
      code: "slenderness",
      message: `Boy/çap oranı ${(a.totalLengthM / D).toFixed(1)} — çok uzun roket eğilme riski taşır.`,
    });
  }

  // 8. Çok ağır kargo
  if (top.payload.hasPayload && top.payload.cargoKg > 0.5) {
    warnings.push({
      level: "info",
      code: "payload",
      message: `Yük ${top.payload.cargoKg.toFixed(2)} kg — apogeeyi düşürür.`,
    });
  }

  // 9. Mach geçiş stabilitesi
  if (a.predictedMaxMach >= 0.85 && a.stabilityCal < 2.0) {
    warnings.push({
      level: "warning",
      code: "supersonic",
      message: `Roket Mach ${a.predictedMaxMach.toFixed(2)}'ye ulaşabilir — süpersonik stabilite için ≥ 2 kalibre gerekir.`,
    });
  }

  // 10. Maliyet bilgisi
  warnings.push({
    level: "info",
    code: "cost",
    message: `Toplam tahmini maliyet: ${a.cost.toFixed(0)} ₺`,
  });

  return warnings;
}

export function warningCounts(warnings: DesignWarning[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: warnings.filter((w) => w.level === "error").length,
    warnings: warnings.filter((w) => w.level === "warning").length,
    infos: warnings.filter((w) => w.level === "info").length,
  };
}

export { PI };
