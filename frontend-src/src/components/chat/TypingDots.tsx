import { motion } from "framer-motion";

export function TypingDots() {
  const dot = {
    hidden: { opacity: 0.25, y: 0 },
    show: { opacity: 0.9, y: -2 },
  };

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-foreground/40"
          variants={dot}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.45, repeat: Infinity, repeatType: "reverse", delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}
