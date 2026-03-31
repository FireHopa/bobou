import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

const messages = [
  "Vamos começar. Defina a identidade do seu robô.",
  "Bom. Agora deixe claro o nicho.",
  "Excelente. Para quem ele fala?",
  "Qual oferta esse robô representa?",
  "Localização ajuda na precisão.",
  "Ajuste o tom de comunicação.",
  "Concorrentes ajudam a posicionar.",
  "Última etapa. Defina o objetivo.",
];

export function Mônica({ step }: { step: number }) {
  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm"
    >
      <Card variant="glass" className="p-4 text-sm">
        🤖 {messages[step]}
      </Card>
    </motion.div>
  );
}
