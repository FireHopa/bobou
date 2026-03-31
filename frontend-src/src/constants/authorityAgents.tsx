import * as React from "react";
import {
  Globe,
  MapPin,
  Star,
  FileText,
  Instagram,
  Linkedin,
  Youtube,
  Sparkles,
  ExternalLink,
  Merge,
} from "lucide-react";

// Importando as imagens usando caminhos relativos
import rosaImg from "../icons/rosa.png";
import pepeImg from "../icons/pepe.png";
import monicaImg from "../icons/monica.png";
import liamImg from "../icons/liam.png";
import georgeImg from "../icons/george.png";
import miaImg from "../icons/mia.png";
import douglasImg from "../icons/douglas.png";
import patriciaImg from "../icons/patricia.png";
import alexImg from "../icons/alex.png";
import lucasImg from "../icons/lucas.png";

export type AuthorityAgentDef = {
  key: string;
  name: string;
  label: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  SidebarIcon: React.ComponentType<{ className?: string }>; // <-- Adicionado para o menu lateral
};

// Componente Mágico: Expande para cobrir o azul e dá zoom no rosto
const createIcon = (src: string) => {
  return function CustomImageIcon({ className }: { className?: string }) {
    return (
      <div 
        className={className} 
        style={{ 
          display: 'flex',
          alignItems: 'center', 
          justifyContent: 'center',
          // Garante que a div base tenha dimensões caso falte classe no pai
          minWidth: '1em',
          minHeight: '1em'
        }}
      >
        {/* Máscara que cresce visualmente para "engolir" a borda azul do pai */}
        <div 
          style={{ 
            width: '100%',
            height: '100%',
            borderRadius: '50%', 
            overflow: 'hidden', 
            position: 'relative',
            zIndex: 10,
            // Esse scale(2.0) dobra o tamanho visual do ícone para fora, cobrindo todo o azul do fundo!
            // Se ainda faltar, mude para 2.2. Se ficar muito grande, reduza para 1.8
            transform: 'scale(2.0)' 
          }}
        >
          <img 
            src={src} 
            alt="Ícone do Agente" 
            style={{ 
              width: '100%',  
              height: '100%', 
              objectFit: 'cover', 
              objectPosition: 'top center', // Mantém o foco na parte de cima (rosto)
              transform: 'scale(1.25)'      // Mantém aquele zoom maroto pra não cortar
            }} 
          />
        </div>
      </div>
    );
  };
};

export const AUTHORITY_AGENTS: AuthorityAgentDef[] = [
  { 
    key: "site", 
    name: "Rosa - Site", 
    label: "Agente Site", 
    desc: "Kit de autoridade para site (páginas, FAQ, prova social).", 
    Icon: createIcon(rosaImg),
    SidebarIcon: Globe 
  },
  { 
    key: "google_business_profile", 
    name: "Pepe - Perfil de Empresa", 
    label: "Agente Perfil de Empresa no Google", 
    desc: "Otimização total do GBP (descrições, posts, avaliações).", 
    Icon: createIcon(pepeImg),
    SidebarIcon: MapPin 
  },
  { 
    key: "social_proof", 
    name: "Lucas - Prova Social", 
    label: "Agente Prova social e reputação", 
    desc: "Scripts e ativos para coletar e publicar prova social.", 
    Icon: createIcon(lucasImg),
    SidebarIcon: Star 
  },
  { 
    key: "decision_content", 
    name: "Douglas - Conteúdos de Decisão", 
    label: "Agente Conteúdos de decisão", 
    desc: "Conteúdos de fundo de funil que fecham sem prometer o impossível.", 
    Icon: createIcon(douglasImg),
    SidebarIcon: FileText 
  },
  { 
    key: "instagram", 
    name: "George - Instagram", 
    label: "Agente Instagram", 
    desc: "Plano de 30 dias + bio + Reels + carrosséis + stories.", 
    Icon: createIcon(georgeImg),
    SidebarIcon: Instagram 
  },
  { 
    key: "linkedin", 
    name: "Monica - LinkedIn", 
    label: "Agente LinkedIn", 
    desc: "Perfil + posts + prospecção + cases (sem inventar números).", 
    Icon: createIcon(monicaImg),
    SidebarIcon: Linkedin 
  },
  { 
    key: "youtube", 
    name: "Liam - Youtube", 
    label: "Agente YouTube", 
    desc: "Ideias, roteiros e SEO para autoridade em vídeo.", 
    Icon: createIcon(liamImg),
    SidebarIcon: Youtube 
  },
  { 
    key: "tiktok", 
    name: "Mia - Tiktok", 
    label: "Agente TikTok", 
    desc: "Bio + roteiros + legendas + hooks + trends para autoridade real no TikTok.", 
    Icon: createIcon(miaImg),
    SidebarIcon: Sparkles 
  },
  { 
    key: "cross_platform_consistency", 
    name: "Patrícia - Consistência Digital", 
    label: "Agente Consistência", 
    desc: "Padronização de mensagens e identidade entre canais.", 
    Icon: createIcon(patriciaImg),
    SidebarIcon: Merge 
  },
  { 
    key: "external_mentions", 
    name: "Alex - Menções externas", 
    label: "Agente Menções externas", 
    desc: "Plano de PR e citações externas (portais, parcerias, releases).", 
    Icon: createIcon(alexImg),
    SidebarIcon: ExternalLink 
  }
];

export function authorityAgentByKey(key?: string | null) {
  return AUTHORITY_AGENTS.find((a) => a.key === key);
}