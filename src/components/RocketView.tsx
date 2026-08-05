// 3D görünüm bileşeni: sahneyi kurar, store'u dinler, oynatımı sürer.

import { useEffect, useRef } from "react";
import { RocketScene } from "../three/scene";
import { useStore } from "../store";
import { TelemetrySample } from "../physics/trajectory";

function lerpSample(a: TelemetrySample, b: TelemetrySample, t: number): TelemetrySample {
  return {
    t: a.t + (b.t - a.t) * t,
    altM: a.altM + (b.altM - a.altM) * t,
    velMps: a.velMps + (b.velMps - a.velMps) * t,
    vertMps: a.vertMps + (b.vertMps - a.vertMps) * t,
    accelMps2: 0,
    gForce: 0,
    mach: a.mach + (b.mach - a.mach) * t,
    q: a.q + (b.q - a.q) * t,
    thrustN: a.thrustN + (b.thrustN - a.thrustN) * t,
    propMassKg: 0,
    massKg: a.massKg + (b.massKg - a.massKg) * t,
    pos: [
      a.pos[0] + (b.pos[0] - a.pos[0]) * t,
      a.pos[1] + (b.pos[1] - a.pos[1]) * t,
      a.pos[2] + (b.pos[2] - a.pos[2]) * t,
    ],
    vel: [
      a.vel[0] + (b.vel[0] - a.vel[0]) * t,
      a.vel[1] + (b.vel[1] - a.vel[1]) * t,
      a.vel[2] + (b.vel[2] - a.vel[2]) * t,
    ],
  };
}

export default function RocketView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RocketScene | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new RocketScene(canvas, {});
    sceneRef.current = scene;
    const st = useStore.getState();
    scene.setRocket(st.config, st.assembly);
    scene.showTrajectory([], false);
    scene.setGridVisible(st.showGrid);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      const s = useStore.getState();

      // Oynatım ilerlemesi
      if (s.status === "running" && s.result) {
        const end = s.result.telemetry[s.result.telemetry.length - 1].t;
        let t = s.simTime + dt * s.speed;
        if (t >= end) {
          t = end;
          s.setStatus("ended");
        }
        s.setSimTime(t);
        // Enterpolasyonlu örnek
        const tel = s.result.telemetry;
        let i = 0;
        while (i < tel.length - 2 && tel[i + 1].t <= t) i++;
        const a = tel[i];
        const b = tel[i + 1] ?? a;
        const frac = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
        scene.applySample(lerpSample(a, b, frac), s.result.events);
      } else if (s.result && s.currentSample) {
        // Durduruldu / bitti / kaydırıcıyla arama — sahneyi aynı saate getir
        scene.applySample(s.currentSample, s.result.events);
      } else {
        // Uçuş yoksa roket rampa üzerinde
        scene.resetToPad();
      }
      scene.update(dt, s.simTime);
    };
    loop();

    // Store aboneliği: tasarım/kamera/yörünge değişince sahneyi güncelle
    const unsub = useStore.subscribe((state, prev) => {
      if (state.config !== prev.config) {
        scene.setRocket(state.config, state.assembly);
      }
      if (state.cameraMode !== prev.cameraMode) {
        scene.setCameraMode(state.cameraMode);
      }
      if (state.showTrajectory !== prev.showTrajectory || state.result !== prev.result) {
        if (state.showTrajectory && state.result) {
          scene.showTrajectory(state.result.telemetry, true);
        } else {
          scene.showTrajectory([], false);
        }
      }
      if (state.showGrid !== prev.showGrid) {
        scene.setGridVisible(state.showGrid);
      }
      if (state.result === null && prev.result !== null) {
        // Sıfırlama: kamerayı rampa görünümüne döndür, zoom'u aç
        scene.resetView();
      }
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      unsub();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
