import { motion } from "framer-motion";
import { transitions } from "@/lib/motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={transitions.base}
      className="min-h-[calc(100vh-64px)]"
    >
      {children}
    </motion.div>
  );
}
