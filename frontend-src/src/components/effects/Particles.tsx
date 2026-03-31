import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

type ParticlesProps = {
  density?: number;
  /** alias (para compatibilidade) */
  quantity?: number;
  className?: string;
};

export function Particles({ density = 14, quantity, className }: ParticlesProps) {
  const reduce = useReducedMotion();
  const finalDensity = typeof quantity === "number" ? quantity : density;
  const dots = React.useMemo(() => Array.from({ length: finalDensity }, (_, i) => i), [finalDensity]);

  if (reduce) return null;

  return (
    <div aria-hidden className={["pointer-events-none absolute inset-0 -z-10", className || ""].join(" ")}>
      {dots.map((i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-foreground/15"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6] }}
          transition={{ duration: 6 + (i % 5), repeat: Infinity, delay: i * 0.2 }}
          style={{
            left: `${(i * 73) % 100}%`,
            top: `${(i * 41) % 100}%`,
          }}
        />
      ))}
    </div>
  );
}
