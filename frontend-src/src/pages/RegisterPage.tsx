import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/state/authStore";

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isPasswordStrong = (pw: string) => {
    const hasUpperCase = /[A-Z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const isLongEnough = pw.length >= 8;
    return hasUpperCase && hasNumber && isLongEnough;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    if (!isPasswordStrong(password)) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres, uma letra maiúscula e um número.");
      return;
    }

    setLoading(true);
    try {
      const data = await authService.register(email, password, name);
      // NOVO: A passar os créditos para o estado global
      setAuth(data.access_token, { email: data.user_email, name: data.user_name, credits: data.credits, has_linkedin: data.has_linkedin, has_instagram: data.has_instagram, instagram_username: data.instagram_username, has_facebook: data.has_facebook, facebook_page_name: data.facebook_page_name, facebook_page_username: data.facebook_page_username, has_youtube: data.has_youtube, youtube_channel_title: data.youtube_channel_title, youtube_channel_handle: data.youtube_channel_handle, has_tiktok: data.has_tiktok, tiktok_display_name: data.tiktok_display_name, tiktok_username: data.tiktok_username, has_google_business_profile: data.has_google_business_profile, google_business_account_display_name: data.google_business_account_display_name, google_business_location_title: data.google_business_location_title, profile_image_url: data.profile_image_url });
      navigate("/"); 
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="mb-6 text-center text-3xl font-bold text-white">Criar Conta</h2>
        
        {error && <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Nome completo</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white focus:border-blue-500 focus:outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Confirmar Palavra-passe</label>
            <input
              type="password"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white focus:border-blue-500 focus:outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 p-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "A registar..." : "Registar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Já tem uma conta? <Link to="/login" className="text-blue-500 hover:underline">Inicie sessão</Link>
        </p>
      </div>
    </div>
  );
}