import { describe, it, expect, beforeEach } from "vitest";
import { useTechStore } from "./store";

describe("tech store", () => {
  beforeEach(() => useTechStore.setState({ status: "idle", simTime: 0, result: null, currentSample: null }));

  it("başlangıçta Alpha varsayılanı yüklü", () => {
    const s = useTechStore.getState();
    expect(s.rocket.stages.length).toBe(1);
    expect(s.selectedId).toBeNull();
    expect(s.tab).toBe("analysis");
  });

  it("addComponent ağaca ekler ve seçer", () => {
    const s = useTechStore.getState();
    const tubeId = s.rocket.stages[0].components.find((c) => c.kind === "bodytube")!.id;
    s.addComponent(tubeId, "centeringring");
    const st = useTechStore.getState();
    const tube = st.rocket.stages[0].components.find((c) => c.kind === "bodytube")!;
    expect(tube.kind === "bodytube" && tube.children.some((c) => c.kind === "centeringring")).toBe(true);
    expect(st.selectedId).toBeTruthy();
  });

  it("updateComponent alanları yamalar", () => {
    const s = useTechStore.getState();
    const nose = s.rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    s.updateComponent(nose.id, { lengthM: 0.09 });
    const st = useTechStore.getState();
    const n2 = st.rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    expect((n2 as { lengthM: number }).lengthM).toBe(0.09);
  });

  it("removeComponent ağaçtan siler", () => {
    const s = useTechStore.getState();
    const lug = s.rocket.stages[0].components.find((c) => c.kind === "launchlug")!;
    const count = s.rocket.stages[0].components.length;
    s.removeComponent(lug.id);
    const st = useTechStore.getState();
    expect(st.rocket.stages[0].components.length).toBe(count - 1);
  });

  it("patchConditions rüzgarı günceller", () => {
    const s = useTechStore.getState();
    s.patchConditions({ windSpeedMps: 5 });
    expect(useTechStore.getState().rocket.conditions.windSpeedMps).toBe(5);
  });

  it("runSimulation gerçek sonuç üretir (Alpha apogee 150-250 m)", () => {
    const s = useTechStore.getState();
    s.runSimulation();
    const st = useTechStore.getState();
    expect(st.result).not.toBeNull();
    expect(st.status).toBe("ended");
    expect(st.result!.samples.length).toBeGreaterThan(10);
    expect(st.result!.summary.apogeeM).toBeGreaterThan(150);
    expect(st.result!.summary.apogeeM).toBeLessThan(250);
  });

  it("setSimTime enterpolasyonlu örnek üretir", () => {
    const s = useTechStore.getState();
    s.runSimulation();
    const st = useTechStore.getState();
    const end = st.result!.samples[st.result!.samples.length - 1].t;
    s.setSimTime(end / 2);
    const st2 = useTechStore.getState();
    expect(st2.currentSample).not.toBeNull();
    expect(Math.abs(st2.currentSample!.t - end / 2)).toBeLessThan(0.05);
    expect(st2.currentSample!.z).toBeGreaterThan(0);
  });

  it("bileşen değişikliği sonucu geçersiz kılar", () => {
    const s = useTechStore.getState();
    s.runSimulation();
    const nose = useTechStore.getState().rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    s.updateComponent(nose.id, { lengthM: 0.09 });
    const st = useTechStore.getState();
    expect(st.result!.samples.length).toBe(0);
    expect(st.currentSample).toBeNull();
  });
});