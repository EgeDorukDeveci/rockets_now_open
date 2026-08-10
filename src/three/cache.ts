// 3D varlık önbelleği ve yıkım yardımcıları.
// Amaç: tasarım değişikliklerinde (sürgü hareketi) sahne yeniden kurulurken
// aynı boyutlardaki geometrileri yeniden üretmek yerine paylaşmak ve eski
// mesh'lerin geometry/material'larını dispose ederek bellek sızıntısını
// önlemek. Paylaşılan geometriler uygulama ömrü boyunca yaşar (dispose
// edilmez) — `userData.shared` işaretine bakılır.

import * as THREE from "three";

const GEOM_LIMIT = 640;
const geomCache = new Map<string, THREE.BufferGeometry>();

/**
 * Aynı parametre anahtarıyla bir kez üretilip paylaşılan geometri döner.
 * Geometri üreteci KESİNLİKLE aynı anahtar için her çağrıda aynı sonucu
 * üretmelidir; üretim sonrası geometri değiştirilmemelidir.
 */
export function cachedGeom(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geomCache.get(key);
  if (hit) return hit;
  if (geomCache.size >= GEOM_LIMIT) geomCache.clear();
  const g = build();
  g.userData.shared = true;
  geomCache.set(key, g);
  return g;
}

/**
 * Alt ağacındaki mesh'lerin geometry/material'larını dispose eder.
 * Paylaşılan (cached) geometriler ve `userData.noDispose` işaretli
 * düğümler (alev gibi tek sefer kurulan gruplar) atlanır.
 */
export function disposeDeep(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o.userData.noDispose) return;
    const mesh = o as THREE.Mesh;
    const g = (mesh as { geometry?: THREE.BufferGeometry }).geometry;
    if (g && !g.userData.shared) g.dispose();
    const m = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(m)) for (const mm of m) mm.dispose();
    else if (m) m.dispose();
  });
}

/** Bir grubun tüm çocuklarını yıkıp boşaltır (chuteGroup temizliği vb.). */
export function clearDisposed(group: THREE.Group): void {
  const kids = [...group.children];
  group.clear();
  for (const k of kids) disposeDeep(k);
}

/**
 * Yörünge vb. nokta dizilerini en fazla `max` noktaya örnekler:
 * ilk ve son nokta her zaman korunur, aradakiler eşit adımla seçilir.
 * 10 bin+ örnekli telemetri çizgisini GPU/Line'a taşıyabilir hale getirir.
 */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return items as T[];
  const out: T[] = [items[0]];
  const stride = (items.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(items[Math.round(i * stride)]);
  out.push(items[items.length - 1]);
  return out;
}