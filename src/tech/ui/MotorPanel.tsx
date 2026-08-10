// Motor kataloğu: listele, seç, itki eğrisini çiz, motormount'a uygula.

import { useMemo, useState } from "react";
import { useTechStore } from "../store";
import { ESTES_MOTORS, TECH_APCP_MOTORS } from "../../physics/motors/catalog";
import { MotorSpec, classFromImpulse } from "../../physics/motors/types";
import { generateThrustCurve } from "../../physics/motors/curve";
import { Chart } from "./charts";
import { BodyTube } from "../model";

const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");

const ALL_MOTORS: MotorSpec[] = [...ESTES_MOTORS, ...TECH_APCP_MOTORS];

function findMountId(rocket: ReturnType<typeof useTechStore.getState>["rocket"]): string | null {
  const walk = (cs: ReturnType<typeof useTechStore.getState>["rocket"]["stages"][0]["components"]): string | null => {
    for (const c of cs) {
      if (c.kind === "motormount") return c.id;
      if (c.kind === "bodytube") {
        const hit = walk((c as BodyTube).children);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const st of rocket.stages) {
    const hit = walk(st.components);
    if (hit) return hit;
  }
  return null;
}

export function MotorPanel() {
  const rocket = useTechStore((s) => s.rocket);
  const updateComponent = useTechStore((s) => s.updateComponent);
  const selectComponent = useTechStore((s) => s.selectComponent);
  const [selected, setSelected] = useState<MotorSpec | null>(ALL_MOTORS[0] ?? null);

  const mountId = useMemo(() => findMountId(rocket), [rocket]);
  const curve = useMemo(() => {
    if (!selected) return [];
    return generateThrustCurve({ totalImpulse: selected.totalImpulse, burnTime: selected.burnTime, grain: selected.grain ?? "endBurn" });
  }, [selected]);

  const applyMotor = (m: MotorSpec) => {
    if (!mountId) return;
    updateComponent(mountId, { motorId: m.id });
    selectComponent(mountId);
  };

  return (
    <div className="panel">
      <div className="panel-head"><span>Motor Kataloğu</span></div>

      <div className="motor-list">
        <div className="table-meta">Barut (Estes)</div>
        {ESTES_MOTORS.map((m) => (
          <MotorRow key={m.id} m={m} selected={selected?.id === m.id} onClick={() => setSelected(m)} onApply={() => applyMotor(m)} hasMount={!!mountId} />
        ))}
        <div className="table-meta">APCP kompozit</div>
        {TECH_APCP_MOTORS.map((m) => (
          <MotorRow key={m.id} m={m} selected={selected?.id === m.id} onClick={() => setSelected(m)} onApply={() => applyMotor(m)} hasMount={!!mountId} />
        ))}
      </div>

      {selected && (
        <div className="motor-detail">
          <div className="table-meta">{selected.name}</div>
          <div className="metric-grid">
            <div className="metric"><span className="metric-label">İtki</span><span className="metric-value">{fmt(selected.totalImpulse)} N·s</span></div>
            <div className="metric"><span className="metric-label">Yanma</span><span className="metric-value">{fmt(selected.burnTime, 2)} s</span></div>
            <div className="metric"><span className="metric-label">Isp</span><span className="metric-value">{fmt(selected.isp)} s</span></div>
            <div className="metric"><span className="metric-label">Kütle</span><span className="metric-value">{fmt(selected.mass * 1000, 0)} g</span></div>
            <div className="metric"><span className="metric-label">Yakıt</span><span className="metric-value">{fmt(selected.propellant * 1000, 0)} g</span></div>
            <div className="metric"><span className="metric-label">Gecikme</span><span className="metric-value">{fmt(selected.delay)} s</span></div>
          </div>
          <Chart
            title="İTKİ EĞRİSİ (N)"
            xMax={selected.burnTime * 1.15}
            height={120}
            series={[{ label: "N", color: "#ff5c7a", points: curve.map((p) => [p.t, p.F]) }]}
          />
          {mountId ? (
            <button className="btn launch small" onClick={() => applyMotor(selected)}>Motora tak: {selected.id}</button>
          ) : (
            <div className="panel-note warn">Rokette motormount yok — önce motor montajı ekleyin.</div>
          )}
        </div>
      )}
    </div>
  );
}

function MotorRow({ m, selected, onClick, onApply, hasMount }: {
  m: MotorSpec;
  selected: boolean;
  onClick: () => void;
  onApply: () => void;
  hasMount: boolean;
}) {
  return (
    <div className={`motor-row ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="motor-id">{m.id}</div>
      <span className="motor-class" title={`${classFromImpulse(m.totalImpulse)} sınıfı (${fmt(m.totalImpulse)} N·s)`}>
        {classFromImpulse(m.totalImpulse)}
      </span>
      <div className="motor-meta">
        <div className="motor-name">{m.name}</div>
        <div className="motor-spec">
          {fmt(m.totalImpulse)} N·s · {fmt(m.mass * 1000, 0)} g · {fmt(m.burnTime, 1)} s
        </div>
      </div>
      <button
        className="btn small"
        disabled={!hasMount}
        onClick={(e) => {
          e.stopPropagation();
          onApply();
        }}
        title="Seçili motormount'a uygula"
      >
        Tak
      </button>
    </div>
  );
}
