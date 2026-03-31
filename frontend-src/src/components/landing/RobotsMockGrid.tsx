import { RobotMock } from "@/components/landing/RobotMock";
import { motion } from "framer-motion";
import { Globe, Instagram } from "lucide-react";

export function RobotsMockGrid() {
  return (
    <div className="relative w-full h-full bg-background flex flex-col">
      {/* O TCHAN: Falso Header de Janela de Sistema (macOS style) */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border/50 bg-muted/40 backdrop-blur-md">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF6464] shadow-sm" />
          <div className="w-3 h-3 rounded-full bg-[#FFA500] shadow-sm" />
          <div className="w-3 h-3 rounded-full bg-[#00D278] shadow-sm" />
        </div>
        <div className="flex-1 text-center pr-8">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Painel Operacional
          </span>
        </div>
      </div>

      <div className="relative p-6 sm:p-10 flex-1">
        {/* Glow de fundo luxuoso e estático (sem piscar) */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-google-blue/10 via-transparent to-transparent opacity-80" />

        <div className="relative grid gap-6 sm:gap-8 sm:grid-cols-2 max-w-2xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col h-full"
          >
            <RobotMock
              title="Caio Web"
              niche="Agente de Site & SEO"
              vibe="AEO Master"
              tone="blue"
              icon={Globe}
              tags={["Páginas AEO", "FAQ", "Provas Sociais"]}
              description="Otimiza a estrutura do seu site para ser lido por IAs e motores de busca."
              className="h-full shadow-xl"
            />
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="flex flex-col h-full sm:translate-y-12"
          >
            <RobotMock
              title="Bia Insta"
              niche="Agente de Instagram"
              vibe="Engajamento"
              tone="red"
              icon={Instagram}
              tags={["Reels", "Carrosséis", "Bio Clara"]}
              description="Cria planos focados em retenção, transformando curiosos em clientes pagantes."
              className="h-full shadow-xl"
            />
          </motion.div>
        </div>
        
        {/* O SEGREDO DO CORTE: Este bloco invisível cria o espaço exato na base para o card da direita não ser decapitado */}
        <div className="h-12 w-full hidden sm:block shrink-0" />
      </div>
    </div>
  );
}