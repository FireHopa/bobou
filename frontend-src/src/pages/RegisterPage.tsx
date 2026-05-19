import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ColorThemeToggle } from "@/components/layout/ColorThemeToggle";
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
      setError("As senhas não coincidem.");
      return;
    }
    if (!isPasswordStrong(password)) {
      setError("A senha deve ter pelo menos 8 caracteres, uma letra maiúscula e um número.");
      return;
    }

    setLoading(true);
    try {
      const data = await authService.register(email, password, name);
      setAuth(data.access_token, {
        email: data.user_email,
        name: data.user_name,
        credits: data.credits,
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
        profile_image_url: data.profile_image_url,
      });
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell flex min-h-screen items-center justify-center overflow-hidden p-4">
      <ColorThemeToggle variant="floating" />

      <div className="auth-page-card w-full max-w-md overflow-hidden rounded-[2rem] border p-7 shadow-2xl sm:p-8">
        <div className="auth-google-strip mb-7" />

        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-label">Bob.IA</p>
          <h2 className="auth-page-title text-3xl font-bold text-white">Criar conta</h2>
          <p className="auth-page-muted mt-2 text-sm text-zinc-400">Comece com seus agentes, projetos e publicações.</p>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="auth-page-muted mb-1.5 block text-sm font-medium text-zinc-400">Nome completo</label>
            <input
              type="text"
              required
              autoComplete="name"
              className="w-full rounded-2xl border p-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="auth-page-muted mb-1.5 block text-sm font-medium text-zinc-400">E-mail</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-2xl border p-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="auth-page-muted mb-1.5 block text-sm font-medium text-zinc-400">Senha</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-2xl border p-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="auth-page-muted mb-1.5 block text-sm font-medium text-zinc-400">Confirmar senha</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-2xl border p-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 p-3.5 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <p className="auth-page-muted mt-6 text-center text-sm text-zinc-400">
          Já tem uma conta? <Link to="/login" className="auth-page-link font-semibold text-blue-500 hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
