import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, MapPin, Target, Sparkles, MessageSquare, Briefcase, Zap, 
  ShieldCheck, AlertCircle, Ban, Star, MessageCircle, Link2, 
  Globe, Instagram, Linkedin, Youtube, Smartphone 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const springTransition = { type: "spring", stiffness: 300, damping: 25 };

// FUNÇÃO À PROVA DE BALAS: Corta exatamente por quantidade de caracteres
function truncateText(text: string, maxLength: number) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

export function RobotPreviewPanel({ 
  values, 
  stepIndex 
}: { 
  values: Record<string, string>, 
  stepIndex: number 
}) {
  const name = values.company_name?.trim() || "Seu Robô";
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  // Todos os campos das Fases 1, 2 e 3 mapeados para a prévia
  const PREVIEW_FIELDS = [
    { key: "niche", label: "Nicho", icon: Briefcase, color: "text-google-blue" },
    { key: "audience", label: "Público", icon: Target, color: "text-google-red" },
    { key: "offer", label: "Oferta", icon: Zap, color: "text-google-yellow" },
    { key: "region", label: "Atuação", icon: MapPin, color: "text-google-green" },
    { key: "tone", label: "Tom de Voz", icon: MessageSquare, color: "text-google-blue" },
    { key: "goals", label: "Objetivo", icon: Sparkles, color: "text-google-red" },
    
    { key: "real_differentials", label: "Diferenciais", icon: ShieldCheck, color: "text-google-blue" },
    { key: "restrictions", label: "Restrições", icon: AlertCircle, color: "text-google-red" },
    { key: "forbidden_content", label: "Proibido", icon: Ban, color: "text-google-red" },
    { key: "reviews", label: "Avaliações", icon: Star, color: "text-google-yellow" },
    { key: "testimonials", label: "Depoimentos", icon: MessageCircle, color: "text-google-yellow" },
    { key: "usable_links_texts", label: "Links Úteis", icon: Link2, color: "text-google-green" },

    { key: "site", label: "Site", icon: Globe, color: "text-google-blue" },
    { key: "instagram", label: "Instagram", icon: Instagram, color: "text-google-purple" },
    { key: "google_business_profile", label: "Google", icon: MapPin, color: "text-google-blue" },
    { key: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-google-blue" },
    { key: "youtube", label: "YouTube", icon: Youtube, color: "text-google-red" },
    { key: "tiktok", label: "TikTok", icon: Smartphone, color: "text-tertiary" },
  ];

  const hasAnyField = PREVIEW_FIELDS.some(f => values[f.key]?.trim());

  // Auto-scroll sempre que um novo campo for preenchido/adicionado
  React.useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }, 150);
    }
  }, [stepIndex, values]);

  return (
    <Card variant="glass" className="overflow-hidden flex flex-col h-full max-h-[550px]">
      <div className="h-1.5 w-full bg-gradient-to-r from-google-blue/40 via-google-green/40 to-google-yellow/40 shrink-0" />
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(0,200,232,0.08)] border border-google-blue/20">
            <Bot className="h-6 w-6 text-google-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">Cérebro em construção</div>
          </div>
          {hasAnyField && (
            <Badge variant="outline" className="animate-in fade-in shrink-0 bg-background/50">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-google-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-google-green"></span>
              </span>
              Online
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0 overflow-hidden flex flex-col flex-1">
        {!hasAnyField ? (
          <div className="px-6 pb-8 text-center text-sm text-muted-foreground">
            Responda às perguntas da Jornada para ver o cérebro do seu robô ganhando vida aqui em tempo real.
          </div>
        ) : (
          <div 
            ref={scrollRef}
            className="overflow-y-auto px-6 pb-6 space-y-3 custom-scrollbar flex-1"
          >
            <AnimatePresence mode="popLayout">
              {PREVIEW_FIELDS.map((field) => {
                const val = values[field.key];
                if (!val || !val.trim()) return null;

                // Aqui aplicamos a trava de 90 caracteres!
                const displayVal = truncateText(val, 35);

                return (
                  <motion.div
                    key={field.key}
                    layout
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={springTransition}
                    className="flex gap-3 items-start bg-background/40 p-3.5 rounded-2xl border shadow-sm"
                  >
                    <div className={cn("mt-0.5 shrink-0", field.color)}>
                      <field.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {field.label}
                      </div>
                      <div 
                        className="text-sm font-medium text-foreground whitespace-pre-wrap break-words leading-relaxed" 
                        title={val} // Se passar o mouse, ele mostra o texto inteiro flutuando
                      >
                        {displayVal}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}