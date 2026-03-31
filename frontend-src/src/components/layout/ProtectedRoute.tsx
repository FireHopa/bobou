import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/state/authStore";

export function ProtectedRoute() {
  // Busca o token no estado global
  const token = useAuthStore((state) => state.token);

  // Se não existir token, manda para a tela de login bloqueando o acesso
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Se tiver token, permite que o usuário veja a página que ele pediu (<Outlet />)
  return <Outlet />;
}