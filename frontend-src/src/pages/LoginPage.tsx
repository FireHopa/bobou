import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/state/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const data = await authService.login(email, password);
      // Salva o token e atualiza os créditos no estado global
      setAuth(data.access_token, { 
        email: data.user_email, 
        name: data.user_name, 
        credits: data.credits || 100,
        has_linkedin: data.has_linkedin,
        has_instagram: data.has_instagram,
        instagram_username: data.instagram_username,
        has_facebook: data.has_facebook,
        facebook_page_name: data.facebook_page_name,
        facebook_page_username: data.facebook_page_username,
        has_youtube: data.has_youtube,
        youtube_channel_title: data.youtube_channel_title,
        youtube_channel_handle: data.youtube_channel_handle,
        has_tiktok: data.has_tiktok,
        tiktok_display_name: data.tiktok_display_name,
        tiktok_username: data.tiktok_username,
        has_google_business_profile: data.has_google_business_profile,
        google_business_account_display_name: data.google_business_account_display_name,
        google_business_location_title: data.google_business_location_title,
      });
      navigate("/"); 
    } catch (err: any) {
      setError(err.message || "Erro ao iniciar sessão.");
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        const data = await authService.googleLogin(tokenResponse.access_token);
        // Salva o token e os créditos no Google Login
        setAuth(data.access_token, { 
          email: data.user_email, 
          name: data.user_name, 
          credits: data.credits || 100,
          has_linkedin: data.has_linkedin,
          has_instagram: data.has_instagram,
          instagram_username: data.instagram_username,
          has_facebook: data.has_facebook,
          facebook_page_name: data.facebook_page_name,
          facebook_page_username: data.facebook_page_username,
          has_youtube: data.has_youtube,
          youtube_channel_title: data.youtube_channel_title,
          youtube_channel_handle: data.youtube_channel_handle,
          has_tiktok: data.has_tiktok,
          tiktok_display_name: data.tiktok_display_name,
          tiktok_username: data.tiktok_username,
        });
        navigate("/");
      } catch (err: any) {
        setError("Erro ao autenticar com o Google.");
        setLoading(false);
      }
    },
    onError: () => setError("O início de sessão com o Google falhou."),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="mb-6 text-center text-3xl font-bold text-white">Iniciar Sessão</h2>
        
        {error && <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">E-mail</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white focus:border-blue-500 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Palavra-passe</label>
            <input
              type="password"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white focus:border-blue-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>

        <div className="my-6 flex items-center text-zinc-500">
          <div className="flex-1 border-t border-zinc-700"></div>
          <span className="mx-4 text-sm">ou</span>
          <div className="flex-1 border-t border-zinc-700"></div>
        </div>

        <button
          onClick={() => loginWithGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-medium text-white transition hover:bg-zinc-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuar com o Google
        </button>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Ainda não tem conta? <Link to="/register" className="text-blue-500 hover:underline">Registe-se aqui</Link>
        </p>
      </div>
    </div>
  );
}