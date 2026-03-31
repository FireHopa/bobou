import { motion } from "framer-motion";

export function Sparkles({ active }: { active: boolean }) {
  if (!active) return null;

  const dots = Array.from({ length: 10 }).map((_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-google-blue/60"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.8 }}
          animate={{
            opacity: [0, 1, 0],
            x: [0, (i - 5) * 14],
            y: [0, (i % 2 === 0 ? -1 : 1) * (18 + i * 2)],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ left: "50%", top: "35%" }}
        />
      ))}
    </div>
  );
}
