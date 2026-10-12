import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// three intrinsics via createElement (NOT JSX) so the visual-edits babel plugin
// does not inject x-* attrs that R3F rejects.
const h = React.createElement;

const COUNT = 70;         // sparse — spread across the whole canvas
const LINK_DIST = 1.9;    // constellation link threshold
const MAX_LINKS = 140;

// shared scroll / pointer signals (window-level; canvas is pointer-events:none)
const sig = { scroll: 0, mx: 0, my: 0 };

function Field() {
  const points = useRef();
  const lines = useRef();

  const { base, phase, positions, linkPos } = useMemo(() => {
    const base = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      base[i * 3] = (Math.random() - 0.5) * 16;
      base[i * 3 + 1] = (Math.random() - 0.5) * 10;
      base[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;
      phase[i] = Math.random() * Math.PI * 2;
    }
    return {
      base, phase,
      positions: new Float32Array(COUNT * 3),
      linkPos: new Float32Array(MAX_LINKS * 2 * 3),
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const arr = points.current.geometry.attributes.position.array;
    const px = sig.mx * 0.4, py = -sig.my * 0.3;
    const sY = sig.scroll * 0.0016;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.3 + phase[i]) * 0.3 + px;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.25 + phase[i]) * 0.3 + py + sY;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 0.2 + phase[i]) * 0.2;
    }
    points.current.geometry.attributes.position.needsUpdate = true;

    // constellation links between nearby particles
    let n = 0;
    for (let i = 0; i < COUNT && n < MAX_LINKS; i++) {
      for (let j = i + 1; j < COUNT && n < MAX_LINKS; j++) {
        const dx = arr[i * 3] - arr[j * 3];
        const dy = arr[i * 3 + 1] - arr[j * 3 + 1];
        const dz = arr[i * 3 + 2] - arr[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < LINK_DIST * LINK_DIST) {
          linkPos[n * 6] = arr[i * 3]; linkPos[n * 6 + 1] = arr[i * 3 + 1]; linkPos[n * 6 + 2] = arr[i * 3 + 2];
          linkPos[n * 6 + 3] = arr[j * 3]; linkPos[n * 6 + 4] = arr[j * 3 + 1]; linkPos[n * 6 + 5] = arr[j * 3 + 2];
          n++;
        }
      }
    }
    const lg = lines.current.geometry;
    lg.attributes.position.needsUpdate = true;
    lg.setDrawRange(0, n * 2);

    const grp = points.current.parent;
    grp.rotation.y = Math.sin(t * 0.05) * 0.1 + px * 0.05;
    grp.rotation.x = -sY * 0.03;
  });

  return h(
    "group",
    null,
    h("points", { ref: points },
      h("bufferGeometry", null, h("bufferAttribute", { attach: "attributes-position", args: [positions, 3] })),
      h("pointsMaterial", { color: "#4f74ff", size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })),
    h("lineSegments", { ref: lines },
      h("bufferGeometry", null, h("bufferAttribute", { attach: "attributes-position", args: [linkPos, 3] })),
      h("lineBasicMaterial", { color: "#6d3fc4", transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
}

/** Site-wide, scroll-reactive ambient FX — mounted once behind all pages. */
export default function BackgroundFX() {
  useEffect(() => {
    const onScroll = () => { sig.scroll = window.scrollY || 0; };
    const onMove = (e) => {
      sig.mx = e.clientX / window.innerWidth - 0.5;
      sig.my = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("mousemove", onMove); };
  }, []);

  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "var(--page-bg)" }}
    >
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearAlpha(0)}>
        {h(Field, null)}
      </Canvas>
    </div>
  );
}
