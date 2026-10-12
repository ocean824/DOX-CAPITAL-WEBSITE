import { motion, useScroll, useSpring } from "framer-motion";

/** Thin gold scroll-progress bar fixed to the top of the viewport. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return <motion.div data-testid="scroll-progress" className="scroll-progress" style={{ scaleX }} />;
}
