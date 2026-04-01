import * as React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  FolderKanban,
  BookOpen,
  Video,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  ChevronDown,
  Database,
  LogOut,
  Coins,
  Image as ImageIcon,
  Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/constants/app";
import logoUrl from "@/casadoads.png";
import { transitions } from "@/lib/motion";
import { AUTHORITY_AGENTS } from "@/constants/authorityAgents";
import { useAuthStore } from "@/state/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Item = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  subItems?: { to: string; label: string; Icon: React.ComponentType<{ className?: string }> }[];
};

const items: Item[] = [
  { to: "/dashboard", label: "Meus Agentes", Icon: Bot },
  { 
    to: "/authority-agents", 
    label: "Agentes de Autoridade", 
    Icon: Sparkles,
    subItems: [
      { to: "/authority-agents/nucleus", label: "Núcleo da Empresa", Icon: Database },
      ...AUTHORITY_AGENTS.map((agent) => ({
        to: `/authority-agents/run/${agent.key}`,
        label: agent.name,
        Icon: agent.SidebarIcon 
      }))
    ]
  },
  { to: "/image-engine", label: "Motor de Imagem", Icon: ImageIcon },
  { to: "/skybob", label: "SkyBob", Icon: Rocket },
  { to: "/bobar", label: "Bobar", Icon: FolderKanban },
  { to: "/materials", label: "Materiais de Apoio", Icon: BookOpen },
  { to: "/video", label: "Video Aula", Icon: Video },
];

const KEY = "arp:sidebar:collapsed:v1";

function loadCollapsed() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

export function Sidebar({ onWidthChange }: { onWidthChange?: (w: number) => void; }) {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => (typeof window === "undefined" ? false : loadCollapsed()));
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = React.useState<Record<string, boolean>>({
    "Agentes de Autoridade": location.pathname.includes("/authority-agents")
  });
  
  // AUTENTICAÇÃO E DADOS DA CONTA
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const avatarLabel = user?.name?.trim() || user?.email || "Usuário";
  const avatarInitial = avatarLabel.charAt(0).toUpperCase();

  React.useEffect(() => {
    saveCollapsed(collapsed);
    onWidthChange?.(collapsed ? 84 : 268);
  }, [collapsed, onWidthChange]);

  const toggleSubMenu = (label: string, e: React.MouseEvent) => {
    setExpandedMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    logout();
    navigate("/");
  };

  const width = collapsed ? 84 : 268;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-dvh border-r border-[rgba(0,200,232,0.08)] bg-sidebar backdrop-blur shadow-sidebar transition-all flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar scrollbar-gutter-stable"
      )}
      style={{ width }}
    >
      <div className="flex flex-col p-3 min-h-full">
        <Link
          to="/"
          className={cn(
            "group flex items-center gap-3 rounded-2xl px-3 py-3 transition",
            "hover:bg-[rgba(0,200,232,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <img src={logoUrl} alt="Logo Autoridade" className={cn("h-10 w-auto max-w-[160px] object-contain", collapsed ? "max-w-[44px]" : "")} />
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</div>
              <div className="truncate text-xs text-muted-foreground">painel premium</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setCollapsed((v) => !v); }}
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-background/40 shadow-soft transition hover:bg-[rgba(0,200,232,0.10)]")}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </Link>

        <div className="mt-4 flex-1 space-y-1">
          {items.map((it) => {
            const hasSub = !!it.subItems?.length;
            const isExpanded = expandedMenus[it.label];
            const isActiveParent = location.pathname === it.to || (hasSub && location.pathname.startsWith(it.to));

            return (
              <div key={it.to} className="flex flex-col">
                <div className="flex items-center">
                  <NavLink
                    to={it.to}
                    onClick={(e) => { if (hasSub && !collapsed) { toggleSubMenu(it.label, e); } }}
                    className={cn(
                      "group flex flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition relative",
                      "hover:bg-[rgba(0,200,232,0.10)]",
                      isActiveParent ? "bg-[rgba(0,200,232,0.08)] ring-1 ring-border/70" : "ring-1 ring-transparent"
                    )}
                  >
                    <motion.div initial={false} animate={{ scale: isActiveParent ? 1.02 : 1 }} transition={transitions.base} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl border shadow-soft", isActiveParent ? "bg-[rgba(0,200,232,0.08)]" : "bg-[rgba(0,200,232,0.08)]")}>
                      <it.Icon className={cn("h-5 w-5", isActiveParent ? "text-foreground" : "text-muted-foreground")} />
                    </motion.div>
                    {!collapsed && (
                      <div className="min-w-0 flex-1 flex justify-between items-center">
                        <div className="truncate font-medium">{it.label}</div>
                        {hasSub && (
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-180" : "")} />
                        )}
                      </div>
                    )}
                  </NavLink>
                </div>

                {hasSub && !collapsed && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-12 mt-1 space-y-1 border-l-2 border-border/50 pl-2">
                          {it.subItems!.map((sub) => (
                            <NavLink
                              key={sub.to}
                              to={sub.to}
                              className={({ isActive }) => cn(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                                isActive ? "bg-[rgba(0,200,232,0.12)] text-[#00C8E8] font-medium shadow-[inset_3px_0_0_0_#00C8E8]" : "text-muted-foreground hover:bg-[rgba(0,200,232,0.10)] hover:text-foreground"
                              )}
                            >
                              <sub.Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{sub.label}</span>
                            </NavLink>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </div>

        {/* -----------------------------------------------------
            FOOTER DA SIDEBAR: CRÉDITOS E PERFIL DO UTILIZADOR
            ----------------------------------------------------- */}
        {user && (
          <div className="mt-4 flex flex-col gap-2 border-t border-[rgba(0,200,232,0.08)] pt-4 pb-1">
            {!collapsed ? (
              <>
                {/* Tag de Créditos */}
                <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-500 border border-blue-500/20">
                  <Coins className="h-4 w-4" />
                  <span>{user.credits ?? 0} Créditos</span>
                </div>

                {/* Link para Minha Conta */}
                <Link
                  to="/conta"
                  className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[rgba(0,200,232,0.10)] cursor-pointer mt-1"
                >
                  <Avatar className="h-10 w-10 shrink-0 rounded-full ring-2 ring-[#00C8E8]/20">
                    {user.profile_image_url ? <AvatarImage src={user.profile_image_url} alt={avatarLabel} /> : null}
                    <AvatarFallback className="rounded-full bg-[#00C8E8] font-bold text-white">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {user.name?.split(" ")[0] || "Usuário"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </Link>

                {/* Botão de Sair */}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/20 mt-1"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </>
            ) : (
              // Versão Colapsada
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center rounded-xl bg-blue-500/10 h-10 w-10 text-blue-500 border border-blue-500/20" title={`${user.credits ?? 0} Créditos`}>
                  <Coins className="h-5 w-5" />
                </div>
                <Link to="/conta" title="Minha Conta">
                  <Avatar className="h-10 w-10 shrink-0 rounded-full shadow-md ring-2 ring-[#00C8E8]/20 transition hover:ring-[#00C8E8]/50">
                    {user.profile_image_url ? <AvatarImage src={user.profile_image_url} alt={avatarLabel} /> : null}
                    <AvatarFallback className="rounded-full bg-[#00C8E8] font-bold text-white">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500 transition hover:bg-red-500/20"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}