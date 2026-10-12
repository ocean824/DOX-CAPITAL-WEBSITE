import { useEffect, useRef } from "react";

/** Adds .is-in to children with .reveal once they enter the viewport. */
export default function Reveal({ children, as = "div", className = "", ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    ref.current.querySelectorAll(".reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
    // Effect runs once on mount to observe static child elements; no reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Tag = as;
  return <Tag ref={ref} className={className} {...rest}>{children}</Tag>;
}
