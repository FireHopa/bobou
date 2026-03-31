import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { transitions, fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Props = HTMLMotionProps<"div"> & {
  variant?: "fadeUp" | "fade";
  delay?: number;
};

export function MotionInView({
  className,
  children,
  delay = 0,
  ...props
}: Props) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...transitions.base, delay }}
      variants={fadeUp}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
