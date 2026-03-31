import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Linkedin, Globe2, ThumbsUp, MessageSquare, Repeat2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  onPublish: (text: string) => void;
  loading: boolean;
};

export function PublishModal({ isOpen, onClose, initialText, onPublish, loading }: Props) {
  const [text, setText] = useState("");
  const { user } = useAuthStore();

  useEffect(() => {
    if (isOpen) setText(initialText);
  }, [isOpen, initialText]);

  if (!isOpen || typeof document === "undefined") return null;

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "U";
  const displayName = user?.name || "Usuário do LinkedIn";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 sm:p-6 lg:p-8 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-2xl border border-border animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] h-full sm:h-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2] shadow-sm">
              <Linkedin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Pré-visualização do Post</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Clique no texto abaixo para editar antes de publicar.</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 md:p-8 bg-muted/30 overflow-y-auto flex-1 flex justify-center custom-scrollbar">
          <div className="w-full max-w-3xl bg-background rounded-xl shadow-md border border-border overflow-hidden flex flex-col">
            <div className="flex items-center gap-4 p-4">
              <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-inner">
                {initials}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-foreground text-base leading-tight hover:text-blue-500 cursor-pointer">
                  {displayName}
                </span>
                <span className="text-sm text-muted-foreground leading-tight mt-1">
                  Especialista em Autoridade • 1º
                </span>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <span>Agora</span>
                  <span>•</span>
                  <Globe2 className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>

            <div className="px-4 pb-3 flex-1 flex flex-col">
              <textarea 
                value={text} 
                onChange={(e) => setText(e.target.value)} 
                className="w-full min-h-[400px] lg:min-h-[500px] flex-1 bg-transparent resize-none outline-none focus:ring-0 text-foreground text-base leading-relaxed custom-scrollbar" 
                placeholder="No que você está pensando?"
              />
            </div>

            <div className="border-t border-border px-3 py-2 flex items-center justify-between text-muted-foreground/80 mt-auto">
              <div className="flex items-center gap-1 px-2.5 py-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                <ThumbsUp className="h-4 w-4" />
                <span className="text-xs font-semibold hidden sm:inline">Gostar</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs font-semibold hidden sm:inline">Comentar</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                <Repeat2 className="h-4 w-4" />
                <span className="text-xs font-semibold hidden sm:inline">Republicar</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                <Send className="h-4 w-4" />
                <span className="text-xs font-semibold hidden sm:inline">Enviar</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/10 p-4 shrink-0">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={loading} className="rounded-xl text-base">
            Voltar a Editar
          </Button>
          <Button 
            size="lg"
            onClick={() => onPublish(text)} 
            disabled={loading || !text.trim()} 
            className="rounded-xl bg-[#0A66C2] text-white hover:bg-[#004182] px-8 text-base shadow-md"
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Linkedin className="mr-2 h-5 w-5" />}
            {loading ? "Publicando..." : "Publicar no LinkedIn"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
