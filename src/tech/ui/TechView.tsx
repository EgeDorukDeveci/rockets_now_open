// Teknik mod 3D görünümü: TechScene'i kurar, tech store'u dinler, oynatımı sürer.

import { useEffect, useRef } from "react";
import { TechScene } from "../three/techScene";
import { useTechStore } from "../store";
import { sampleAtTime } from "../physics/simulator";

export default function TechView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TechScene | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new TechScene(canvas, {});
    sceneRef.current = scene;
    const st = useTechStore.getState();
    scene.setRocket(st.rocket);
    scene.setCameraMode(st.cameraMode);
    scene.setGridVisible(st.showGrid);
    if (st.result) scene.showTrajectory(st.result.samples, st.showTrajectory);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      const s = useTechStore.getState();
      if (s.status === "running" && s.result && s.result.samples.length) {
        const end = s.result.samples[s.result.samples.length - 1].t;
        let t = s.simTime + dt * 4;
        if (t >= end) {
          t = end;
          s.setStatus("ended");
        }
        s.setSimTime(t);
        scene.applySample(sampleAtTime(s.result, t));
      } else if (s.result && s.currentSample) {
        scene.applySample(s.currentSample);
      } else {
        scene.resetToPad();
      }
    };
    loop();

    const unsub = useTechStore.subscribe((state, prev) => {
      if (state.rocket !== prev.rocket) {
        scene.setRocket(state.rocket);
      }
      if (state.cameraMode !== prev.cameraMode) {
        scene.setCameraMode(state.cameraMode);
      }
      if (state.showTrajectory !== prev.showTrajectory || state.result !== prev.result) {
        if (state.showTrajectory && state.result) {
          scene.showTrajectory(state.result.samples, true);
        } else {
          scene.showTrajectory([], false);
        }
      }
      if (state.showGrid !== prev.showGrid) {
        scene.setGridVisible(state.showGrid);
      }
      if (state.result === null && prev.result !== null) {
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
