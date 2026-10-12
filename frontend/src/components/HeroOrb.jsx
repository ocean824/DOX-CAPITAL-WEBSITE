import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import * as THREE from "three";

// three.js intrinsics are created via React.createElement (NOT JSX) so the
// visual-edits babel plugin does not inject x-* source attrs that R3F rejects.
const h = React.createElement;

/* Fibonacci-sphere unit directions — even distribution over a sphere. */
function fibonacciDirs(count) {
  const dirs = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    dirs[i * 3] = Math.cos(theta) * r;
    dirs[i * 3 + 1] = y;
    dirs[i * 3 + 2] = Math.sin(theta) * r;
  }
  return dirs;
}

/* Soft circular sprite so points render as round dots instead of squares. */
function makeCircleTexture() {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* Particle shell that breathes between an assembled sphere and a scattered
   orbit — the "pieces coming into and out of orbit" effect. */
function Shell({ count, radius, orbit, color, size, opacity, swirl }) {
  const ref = useRef();
  const circle = useMemo(makeCircleTexture, []);
  const { dirs, phase, speed, positions } = useMemo(() => {
    const dirs = fibonacciDirs(count);
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phase[i] = Math.random() * Math.PI * 2;
      speed[i] = 0.5 + Math.random() * 1.1;
    }
    return { dirs, phase, speed, positions: new Float32Array(count * 3) };
  }, [count]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const arr = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const k = 0.5 + 0.5 * Math.sin(t * speed[i] + phase[i]); // 0..1 in/out
      const rad = radius + k * orbit;
      const a = swirl * (k - 0.5) * 2 + t * 0.15 * speed[i];
      const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
      const ca = Math.cos(a), sa = Math.sin(a);
      arr[i * 3] = (dx * ca - dz * sa) * rad;
      arr[i * 3 + 1] = dy * rad;
      arr[i * 3 + 2] = (dx * sa + dz * ca) * rad;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = t * 0.06;
  });

  return h(
    "points",
    { ref },
    h("bufferGeometry", null,
      h("bufferAttribute", { attach: "attributes-position", args: [positions, 3] })),
    h("pointsMaterial", {
      color, size, sizeAttenuation: true, transparent: true, opacity,
      map: circle, alphaMap: circle, alphaTest: 0.01,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
}

/* Bright gold nodes riding tilted orbital rings. */
function OrbitNodes() {
  const group = useRef();
  const rings = useMemo(() => ([
    { r: 2.2, tilt: 1.3, speed: 0.5, n: 3 },
    { r: 2.7, tilt: 0.6, speed: -0.35, n: 2 },
    { r: 1.9, tilt: 1.9, speed: 0.7, n: 2 },
  ]), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    group.current.children.forEach((ring, i) => { ring.rotation.z = t * rings[i].speed; });
  });
  return h(
    "group",
    { ref: group },
    rings.map((ring, i) =>
      h(
        "group",
        { key: i, rotation: [ring.tilt, 0, 0] },
        Array.from({ length: ring.n }).map((_, j) => {
          const a = (j / ring.n) * Math.PI * 2;
          return h(
            "mesh",
            { key: j, position: [Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0] },
            h("sphereGeometry", { args: [0.05, 32, 32] }),
            h("meshStandardMaterial", {
              color: "#d4af37", metalness: 1, roughness: 0.25,
              emissive: "#8a6a12", emissiveIntensity: 0.35,
            })
          );
        })
      )
    )
  );
}

function Scene() {
  const group = useRef();
  useFrame((state) => {
    const { x, y } = state.pointer;
    group.current.rotation.y += ((x * 0.5) - group.current.rotation.y) * 0.04;
    group.current.rotation.x += ((-y * 0.4) - group.current.rotation.x) * 0.04;
  });
  return h(
    React.Fragment,
    null,
    h("ambientLight", { intensity: 0.7 }),
    h("pointLight", { position: [4, 3, 5], intensity: 1.6, color: "#fff4d6" }),
    h("pointLight", { position: [-4, -2, 3], intensity: 0.9, color: "#ffd46b" }),
    h("directionalLight", { position: [0, 5, 2], intensity: 1.1, color: "#ffffff" }),
    h(
      "group",
      { ref: group },
      h(Shell, { count: 650, radius: 1.55, orbit: 0.9, color: "#ffcf4d", size: 0.034, opacity: 0.95, swirl: 0.6 }),
      h(Shell, { count: 380, radius: 1.7, orbit: 1.15, color: "#e0a52e", size: 0.022, opacity: 0.72, swirl: -0.4 }),
      h(Shell, { count: 220, radius: 1.3, orbit: 0.5, color: "#cfd3dd", size: 0.034, opacity: 0.75, swirl: 0.9 }),
      h(OrbitNodes, null)
    )
  );
}

/** AAA-style WebGL hero: a self-assembling particle sphere orbiting a glowing D.O.X. core. */
export default function HeroOrb({ fill = false }) {
  const wrapClass = fill
    ? "absolute inset-0 w-full h-full"
    : "relative aspect-square w-full max-w-[860px] mx-auto";
  return (
    <div data-testid="hero-orb" className={wrapClass}>
      <Canvas
        className="absolute inset-0"
        camera={{ position: [0, 0, 5.2], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        {h(Scene, null)}
      </Canvas>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
        <div className="absolute h-40 w-40 rounded-full sphere-glow"
          style={{ background: "radial-gradient(circle, rgba(255,207,77,0.42), transparent 68%)" }} />
      </div>

      {!fill ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-5xl lg:text-6xl tracking-tight"
            style={{ color: "#fff", textShadow: "0 0 26px rgba(255,207,77,0.8), 0 0 10px rgba(224,165,46,0.6)" }}
          >
            D.O.X
          </motion.div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-6xl lg:text-8xl tracking-tight"
            style={{ color: "#fff", textShadow: "0 0 26px rgba(255,207,77,0.8), 0 0 10px rgba(224,165,46,0.6)" }}
          >
            D.O.X
          </motion.div>
        </div>
      )}
    </div>
  );
}
