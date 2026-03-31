import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type RobotMockProps = {
  title: string;
  niche: string;
  vibe: string;
  description: string;
  icon: LucideIcon;
  tags: string[];
  tone?: "blue" | "red" | "yellow" | "green";
  className?: string;
};

export function RobotMock({
  title,
  niche,
  vibe,
  description,
  icon: Icon,
  tags,
  tone = "blue",
  className,
}: RobotMockProps) {
  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }} 
      transition={{ duration: 0.2, ease: "easeOut" }} 
      className={cn("h-full", className)}
    >
      <Card className="h-full relative overflow-hidden bg-background/70 backdrop-blur-xl border-border/60 hover:border-foreground/20 transition-all flex flex-col group">
        
        {/* Efeito de "Luz de Teto" que acende sutilmente no hover */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-32 opacity-10 group-hover:opacity-30 transition-opacity duration-500 pointer-events-none bg-gradient-to-b to-transparent",
          tone === "blue" && "from-google-blue",
          tone === "red" && "from-google-red",
          tone === "green" && "from-google-green",
          tone === "yellow" && "from-google-yellow"
        )} />
        
        <div className="p-6 flex-1 flex flex-col relative z-10">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-4">
              <Avatar tone={tone} className="h-12 w-12 ring-2 ring-background shadow-sm">
                <AvatarFallback tone={tone} className="bg-background">
                  <Icon className={cn("h-6 w-6", 
                    tone === "blue" && "text-google-blue",
                    tone === "red" && "text-google-red",
                    tone === "green" && "text-google-green",
                    tone === "yellow" && "text-google-yellow"
                  )} aria-hidden />
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight">{title}</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-google-green opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-google-green"></span>
                  </span>
                </div>
                <div className="text-sm font-medium text-muted-foreground mt-0.5">{niche}</div>
              </div>
            </div>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed mb-6 flex-1">
            {description}
          </p>

          <div className="flex flex-wrap gap-2 mt-auto">
            <Badge variant="outline" className={cn(
              "text-[10px] uppercase tracking-wider font-bold border-transparent",
              tone === "blue" && "bg-[rgba(0,200,232,0.08)] text-google-blue",
              tone === "red" && "bg-[rgba(255,100,100,0.15)] text-google-red",
              tone === "green" && "bg-google-green/10 text-google-green",
              tone === "yellow" && "bg-google-yellow/10 text-google-yellow"
            )}>
              {vibe}
            </Badge>
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-muted text-[10px] font-medium text-muted-foreground border-transparent shadow-none">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Linha de força colorida na base do card */}
        <div className={cn(
          "h-1.5 w-full mt-auto relative z-10",
          tone === "blue" && "bg-google-blue",
          tone === "red" && "bg-google-red",
          tone === "green" && "bg-google-green",
          tone === "yellow" && "bg-google-yellow"
        )} />
      </Card>
    </motion.div>
  );
}