import { useEffect, useRef } from "react";

// Lightweight canvas "matrix rain" effect, gold-tinted to match the brand.
export default function MatrixRain({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;
    const chars = "アカサタナハマヤラワ0123456789DOXコソ$€¥".split("");
    const fontSize = 14;
    let columns = 0;
    let drops = [];
    let raf;
    let running = true;

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.floor(w / fontSize);
      drops = new Array(columns).fill(0).map(() => Math.random() * -40);
    };

    let last = 0;
    const draw = (t) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (t - last < 55) return; // ~18fps, subtle
      last = t;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        // bright leading glyph
        ctx.fillStyle = "rgba(201,160,255,0.95)";
        ctx.fillText(text, x, y);
        // trailing glyph, dimmer purple
        ctx.fillStyle = "rgba(124,77,196,0.55)";
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y - fontSize);
        if (y > h && Math.random() > 0.975) drops[i] = Math.random() * -20;
        drops[i] += 1;
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="matrix-rain" className={className} />;
}
