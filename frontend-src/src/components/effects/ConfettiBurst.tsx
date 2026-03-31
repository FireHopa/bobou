import { motion, useReducedMotion } from "framer-motion";

export function ConfettiBurst({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return null;

  const pieces = Array.from({ length: 18 }).map((_, i) => i);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((i) => {
        const x = (i - 9) * 18;
        const rot = (i - 9) * 8;
        const delay = (i % 6) * 0.02;
        const color =
          i % 4 === 0 ? "bg-google-blue/70" : i % 4 === 1 ? "bg-google-green/70" : i % 4 === 2 ? "bg-google-yellow/70" : "bg-google-red/70";
        return (
          <motion.span
            key={i}
            className={`absolute left-1/2 top-1/3 h-2 w-1 rounded ${color}`}
            initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 0], x: [0, x], y: [0, -40 - (i % 5) * 8, 120 + (i % 4) * 10], rotate: [0, rot], scale: [0.8, 1, 0.9] }}
            transition={{ duration: 0.95, ease: "easeOut", delay }}
          />
        );
      })}
    </div>
  );
}
