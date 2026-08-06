// Teknik mod ana yerleşimi: sol ağaç + editör, orta 3D, sağ sekmeli paneller.

import { useTechStore } from "../store";
import ComponentTree from "./ComponentTree";
import ComponentEditor from "./ComponentEditor";
import { MetricsPanel } from "./MetricsPanel";
import { ComponentAnalysis } from "./ComponentAnalysis";
import { CdMachPanel } from "./CdMachPanel";
import SimulationPanel from "./SimulationPanel";
import { MotorPanel } from "./MotorPanel";
import TechView from "./TechView";

const TABS = [
  { id: "analysis" as const, label: "Analiz" },
  { id: "drag" as const, label: "Sürükleme" },
  { id: "simulation" as const, label: "Simülasyon" },
  { id: "motor" as const, label: "Motor" },
];

function CameraButtons() {
  const cameraMode = useTechStore((s) => s.cameraMode);
  const setCameraMode = useTechStore((s) => s.setCameraMode);
  return (
    <div className="camera-buttons">
      <button className={`cb ${cameraMode === "follow" ? "active" : ""}`} onClick={() => setCameraMode("follow")} title="Takip kamerası">Takip</button>
      <button className={`cb ${cameraMode === "pad" ? "active" : ""}`} onClick={() => setCameraMode("pad")} title="Rampa kamerası">Rampa</button>
      <button className={`cb ${cameraMode === "free" ? "active" : ""}`} onClick={() => setCameraMode("free")} title="Serbest kamera">Serbest</button>
    </div>
  );
}

function ViewToggles() {
  const showTrajectory = useTechStore((s) => s.showTrajectory);
  const showGrid = useTechStore((s) => s.showGrid);
  const setTrajectory = useTechStore((s) => s.setShowTrajectory);
  const setGrid = useTechStore((s) => s.setShowGrid);
  return (
    <div className="view-toggles" role="group" aria-label="Görünüm katmanları">
      <button className={`vt ${showTrajectory ? "on" : ""}`} onClick={() => setTrajectory(!showTrajectory)} title="Yörünge çizgisi">
        <span /> Yörünge
      </button>
      <button className={`vt ${showGrid ? "on" : ""}`} onClick={() => setGrid(!showGrid)} title="Zemin ızgarası">
        <span /> Izgara
      </button>
    </div>
  );
}

export default function TechApp() {
  const tab = useTechStore((s) => s.tab);
  const setTab = useTechStore((s) => s.setTab);
  const resetSim = useTechStore((s) => s.resetSim);

  return (
    <main className="layout tech-layout">
      <aside className="left tech-left">
        <div className="tech-left-scroll">
          <ComponentTree />
          <ComponentEditor />
        </div>
      </aside>
      <section className="center">
        <div className="view3d">
          <TechView />
        </div>
        <CameraButtons />
        <ViewToggles />
      </section>
      <aside className="right tech-right">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button className="tab tab-clear" onClick={resetSim} title="Simülasyonu sıfırla">
            ↺
          </button>
        </div>
        <div className="tech-right-scroll">
          {tab === "analysis" && <MetricsPanel />}
          {tab === "drag" && (<>
            <ComponentAnalysis />
            <CdMachPanel />
          </>)}
          {tab === "simulation" && <SimulationPanel />}
          {tab === "motor" && <MotorPanel />}
        </div>
      </aside>
    </main>
  );
}