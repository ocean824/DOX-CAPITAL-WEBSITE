import { useEffect, useRef } from "react";

/** Lightweight WebGL-free 3D-ish hero scene: layered animated blobs + tilt parallax. */
export default function HeroOrb() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf;
    let t = 0;
    const tick = () => {
      t += 0.006;
      const o1 = el.querySelector("[data-orb=\"1\"]");
      const o2 = el.querySelector("[data-orb=\"2\"]");
      const o3 = el.querySelector("[data-orb=\"3\"]");
      const ring = el.querySelector("[data-ring]");
      if (o1) o1.style.transform = `translate(${Math.sin(t) * 20}px, ${Math.cos(t * 0.7) * 14}px)`;
      if (o2) o2.style.transform = `translate(${Math.cos(t * 0.9) * 18}px, ${Math.sin(t * 1.1) * 22}px)`;
      if (o3) o3.style.transform = `translate(${Math.sin(t * 1.3) * 26}px, ${Math.cos(t * 0.6) * 18}px)`;
      if (ring) ring.style.transform = `rotate(${(t * 30) % 360}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tilt-x", `${x * 6}deg`);
      el.style.setProperty("--tilt-y", `${-y * 6}deg`);
    };
    el.addEventListener("mousemove", onMove);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("mousemove", onMove); };
    // Self-contained animation loop; no reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      data-testid="hero-orb"
      className="relative aspect-square w-full max-w-[560px] mx-auto"
      style={{ perspective: 1200 }}
    >
      <div
        className="absolute inset-0 transition-transform duration-300"
        style={{ transform: "rotateX(var(--tilt-y,0)) rotateY(var(--tilt-x,0))", transformStyle: "preserve-3d" }}
      >
        {/* concentric rings */}
        <div data-ring className="absolute inset-6 rounded-full border border-white/10" style={{ transition: "transform 0.2s linear" }} />
        <div className="absolute inset-16 rounded-full border border-white/5" />
        <div className="absolute inset-28 rounded-full border border-white/5" />

        {/* metallic core */}
        <div className="absolute inset-[28%] rounded-full"
             style={{
               background:
                 "radial-gradient(circle at 30% 25%, #fff, #c9c9c9 22%, #555 55%, #1b1b1b 80%, #0a0a0a 100%)",
               boxShadow:
                 "inset 0 0 80px rgba(0,0,0,0.7), 0 0 80px rgba(212,175,55,0.18)",
             }} />

        {/* color orbs */}
        <div data-orb="1" className="orb" style={{ top: "8%", left: "12%", width: 160, height: 160, background: "#D4AF37" }} />
        <div data-orb="2" className="orb" style={{ bottom: "8%", right: "14%", width: 180, height: 180, background: "#3a3a3a" }} />
        <div data-orb="3" className="orb" style={{ top: "40%", right: "0%", width: 120, height: 120, background: "#888" }} />

        {/* hairline cross */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
        </div>
      </div>
    </div>
  );
}
