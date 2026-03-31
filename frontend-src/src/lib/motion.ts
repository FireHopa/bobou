import type { Variants, Transition } from "framer-motion";

export const transitions: Record<"quick" | "base" | "slow", Transition> = {
  quick: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] },
  base: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] },
  slow: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export const fade: Variants = {
  hidden: { opacity: 0, filter: "blur(6px)" },
  show: { opacity: 1, filter: "blur(0px)" },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98, filter: "blur(6px)" },
  show: { opacity: 1, scale: 1, filter: "blur(0px)" },
};

export const hoverLift: Variants = {
  rest: { y: 0, boxShadow: "var(--shadow-soft)" },
  hover: { y: -2, boxShadow: "var(--shadow-card)" },
};
