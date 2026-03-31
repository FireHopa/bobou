import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { transitions } from "@/lib/motion";

export function PlaceholderPage({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transitions.base} className="space-y-6">
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border bg-background/40 p-6 text-sm text-muted-foreground shadow-soft">
            {hint ?? "Funcionalidade em construção. Em breve você terá uma experiência completa aqui."}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default PlaceholderPage;
