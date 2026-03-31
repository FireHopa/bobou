import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastApiError, toastInfo } from "@/lib/toast";

type RecorderState = "idle" | "recording" | "review";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function AudioRecorderInline({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (file: File) => Promise<void> | void;
}) {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [ms, setMs] = React.useState(0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startTsRef = React.useRef<number>(0);

  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const dataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const cleanup = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    analyserRef.current = null;
    dataRef.current = null;

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
    }
    audioCtxRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  React.useEffect(() => {
    return () => {
      cleanup();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [cleanup, audioUrl]);

  const drawWaveform = React.useCallback(() => {
    const canvas = canvasRef.current;
    const an = analyserRef.current;
    const data = dataRef.current;
    if (!canvas || !an || !data) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    an.getByteTimeDomainData(data);

    // clear
    ctx.clearRect(0, 0, w, h);

    // background line
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,200,232,0.30)"; // google blue-ish (ok here, used only in canvas)
    ctx.beginPath();

    const slice = w / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      const y = h / 2 + v * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();

    // center glow
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(0,200,232,0.60)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, []);

  const tick = React.useCallback(() => {
    const now = performance.now();
    setMs(now - startTsRef.current);
    drawWaveform();
    rafRef.current = requestAnimationFrame(tick);
  }, [drawWaveform]);

  const start = async () => {
    if (disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioCtx();
      audioCtxRef.current = actx;

      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        cleanup();
      };

      startTsRef.current = performance.now();
      setMs(0);
      setState("recording");
      mr.start();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      toastApiError(e, "Falha ao acessar microfone");
      cleanup();
      setState("idle");
    }
  };

  const stop = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    try {
      mr.stop();
    } catch {}
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setState("review");
  };

  const discard = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {}
    }
    cleanup();
    setState("idle");
    setMs(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  const send = async () => {
    if (!audioUrl) return;
    toastInfo("Enviando áudio…");
    const res = await fetch(audioUrl);
    const blob = await res.blob();
    const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
    await onSend(file);
    discard();
  };

  return (
    <div className="flex items-center gap-2">
      {state === "idle" ? (
        <Button
          variant="outline"
          size="icon"
          onClick={start}
          disabled={disabled}
          title="Gravar áudio"
          aria-label="Gravar áudio"
        >
          <Mic className="h-4 w-4" />
        </Button>
      ) : state === "recording" ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-2xl border bg-background/40 px-3 py-2 shadow-soft"
          >
            <span className="text-xs text-muted-foreground">{fmt(ms)}</span>
            <canvas
              ref={canvasRef}
              width={160}
              height={34}
              className={cn("rounded-lg", "bg-transparent")}
              aria-label="Waveform"
            />
          </motion.div>

          <Button
            variant="destructive"
            size="icon"
            onClick={stop}
            title="Parar"
            aria-label="Parar gravação"
          >
            <Square className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={discard} title="Descartar" aria-label="Descartar áudio">
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2 rounded-2xl border bg-background/40 px-3 py-2 shadow-soft"
          >
            <audio controls src={audioUrl ?? undefined} className="h-8 w-[160px]" />
          </motion.div>

          <Button
            variant="accent"
            size="icon"
            onClick={() => void send()}
            disabled={disabled}
            title="Enviar áudio"
            aria-label="Enviar áudio"
          >
            <Send className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={discard} title="Descartar" aria-label="Descartar áudio">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AnimatePresence>
      )}
    </div>
  );
}
