// Preset'lerin montaj + tahmin + tam simülasyonda geçerli (finite) sonuç verdiğini doğrular.

import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { assembleRocket } from "./physics/rocket";
import { predictFlight } from "./physics/predict";
import { simulateFlight } from "./physics/trajectory";

describe("preset tasarımları", () => {
  for (const p of PRESETS) {
    it(`${p.name} — montaj/tahmin/simülasyon geçerli`, () => {
      const config = p.build();
      const assembly = assembleRocket(config);
      expect(Number.isFinite(assembly.liftoffMassKg)).toBe(true);
      expect(assembly.liftoffMassKg).toBeGreaterThan(0);
      expect(Number.isFinite(assembly.twr)).toBe(true);
      expect(Number.isFinite(assembly.stabilityCal)).toBe(true);
      expect(Number.isFinite(assembly.totalLengthM)).toBe(true);

      const prediction = predictFlight(config);
      expect(Number.isFinite(prediction.apogeeM)).toBe(true);
      expect(prediction.apogeeM).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(prediction.flightTimeS)).toBe(true);

      const result = simulateFlight({ assembly, throttle: 1 });
      expect(result.telemetry.length).toBeGreaterThan(2);
      for (const s of result.telemetry) {
        expect(Number.isFinite(s.altM)).toBe(true);
        expect(Number.isFinite(s.velMps)).toBe(true);
        expect(Number.isFinite(s.pos[0])).toBe(true);
        expect(Number.isFinite(s.pos[1])).toBe(true);
        expect(Number.isFinite(s.pos[2])).toBe(true);
      }
      // Preset'ler gerçekten uçmalı: soğuk ayrım gecikmesi ilk kademeye
      // uygulanmaz (eski hata: roket rayda düşüp t≈0.5'te çakılıyordu),
      // kurtarma sistemi de doğru tetikle seçilmiş olmalı.
      expect(result.success).toBe(true);
      expect(result.events.some((e) => e.id === "ignition" && e.t < 0.01)).toBe(true);
    });
  }
});
