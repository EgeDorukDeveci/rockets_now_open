// Store akış testi: fırlatma, oynatım ilerlemesi, örnek arama.

import { describe, expect, it } from "vitest";
import { useStore } from "./store";
import { defaultConfig } from "./types";

describe("store", () => {
  it("fırlatma sonucu üretir ve oynatım ilerler", () => {
    const s = useStore.getState();
    s.updateConfig(defaultConfig());
    s.launch();
    const after = useStore.getState();
    expect(after.result).not.toBeNull();
    expect(after.status).toBe("running");
    after.setSimTime(3);
    const t3 = useStore.getState();
    expect(t3.simTime).toBeCloseTo(3, 1);
    expect(t3.currentSample).not.toBeNull();
    after.setSpeed(4);
    expect(useStore.getState().speed).toBe(4);
    after.reset();
    expect(useStore.getState().result).toBeNull();
  });

  it("tasarım güncellemesi montajı yeniden hesaplar", () => {
    const s = useStore.getState();
    const before = s.assembly.liftoffMassKg;
    s.updateStage(0, (st) => ({ ...st, body: { ...st.body, lengthM: 1.0 } }));
    const after = useStore.getState();
    expect(after.assembly.liftoffMassKg).toBeGreaterThan(before);
    expect(after.prediction).not.toBeNull();
  });
});
