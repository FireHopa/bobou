import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AudioRecorderInline } from "@/components/chat/AudioRecorder";

export function ChatComposer({
  value,
  onChange,
  onSend,
  onSendAudio,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSendAudio: (file: File) => void | Promise<void>;
  busy?: boolean;
}) {
  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Enter</Badge>
        <span className="text-xs text-muted-foreground">envia • Shift+Enter quebra linha</span>
      </div>

      <div className="glass relative rounded-2xl border bg-background/40 shadow-soft">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva uma pergunta…"
          className={cn(
            "min-h-[120px] w-full resize-none rounded-2xl bg-transparent px-4 py-4 text-sm outline-none",
            "placeholder:text-muted-foreground/80",
            "pr-24 pb-16"
          )}
          aria-label="Mensagem"
        />

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-end gap-2">
          <AudioRecorderInline disabled={busy} onSend={onSendAudio} />
          <Button variant="accent" onClick={onSend} disabled={busy || !value.trim()} className="h-9">
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
