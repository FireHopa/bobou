import { motion } from "framer-motion";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <motion.div
        className="h-full bg-google-blue"
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}
