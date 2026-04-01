import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/state/authStore";
import { DEFAULT_DAILY_FREE_CREDITS, formatCredits } from "@/lib/credits";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppTopBar() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    logout();
    navigate("/");
  };

  const displayName = user?.name?.split(" ")[0] || "Usuário";
  const avatarLabel = user?.name?.trim() || user?.email || "Usuário";
  const avatarInitial = avatarLabel.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-lg font-bold text-white transition-colors hover:text-blue-400">
          Painel Authority
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {token && user ? (
          <div className="flex items-center gap-2 sm:gap-4">
            <div
              className="hidden items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-400 sm:flex"
              title={`Recebe ${formatCredits(DEFAULT_DAILY_FREE_CREDITS)} créditos diários automaticamente`}
            >
              <span>🪙</span>
              <span>{formatCredits(user.credits ?? 0)} Créditos</span>
            </div>

            <Link
              to="/conta"
              className="flex cursor-pointer items-center gap-3 rounded-xl border-l border-zinc-700 p-2 pl-4 transition hover:bg-zinc-800/50"
            >
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-sm font-medium text-zinc-200">{displayName}</span>
                <span className="text-xs text-zinc-500">{user.email}</span>
              </div>

              <Avatar className="h-9 w-9 rounded-full ring-2 ring-blue-400/30">
                {user.profile_image_url ? <AvatarImage src={user.profile_image_url} alt={avatarLabel} /> : null}
                <AvatarFallback className="rounded-full bg-blue-600 font-bold text-white">{avatarInitial}</AvatarFallback>
              </Avatar>
            </Link>

            <button
              onClick={handleLogout}
              className="ml-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-500/20"
            >
              Sair
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-zinc-400 transition hover:text-white">
              Entrar
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Criar Conta
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
