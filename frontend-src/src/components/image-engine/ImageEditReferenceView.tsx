import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Download,
  Gauge,
  GripHorizontal,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Monitor,
  Move,
  RefreshCcw,
  ScanSearch,
  SendHorizonal,
  Settings2,
  Sparkles,
  Square,
  Smartphone,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/constants/app";
import { appendImageHistory, downloadImage } from "@/lib/imageHistory";
import { dataUrlToFile, readImageDimensionsFromUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { extractResponseErrorMessage, syncCreditsFromResponse } from "@/lib/credits";

type ImageResult = {
  engine_id: string;
  motor: string;
  url: string;
};

type ReferenceAttachment = {
  id: string;
  kind: "base";
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type CanvasItem = {
  id: string;
  kind: "base" | "pending" | "result";
  url: string;
  title: string;
  subtitle?: string;
  status?: string;
  progress?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  engineId?: string;
  motor?: string;
  prompt?: string;
};

type ChatAttachment = {
  id: string;
  label: string;
  name: string;
  previewUrl: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  tone?: "default" | "success" | "warning";
  attachments?: ChatAttachment[];
};

type ActiveJob = {
  id: string;
  instruction: string;
  pendingCanvasItemId: string;
  progress: number;
  status: string;
};

type FloatingPosition = {
  x: number;
  y: number;
};

type FloatingPanelSize = {
  width: number;
  height: number;
};

type FormatOption = {
  value: string;
  label: string;
  shortLabel: string;
  hint: string;
  icon: React.ReactNode;
};

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "quadrado_1_1",
    label: "Quadrado 1:1",
    shortLabel: "1:1",
    hint: "Post e criativo estático.",
    icon: <Square className="h-4 w-4" />,
  },
  {
    value: "vertical_9_16",
    label: "Vertical 9:16",
    shortLabel: "9:16",
    hint: "Stories, reels e shorts.",
    icon: <Smartphone className="h-4 w-4" />,
  },
  {
    value: "horizontal_16_9",
    label: "Horizontal 16:9",
    shortLabel: "16:9",
    hint: "Banner, capa e thumbnail.",
    icon: <Monitor className="h-4 w-4" />,
  },
];

const QUALITY_OPTIONS = [
  {
    value: "baixa",
    label: "Rascunho",
    shortLabel: "Rápida",
    hint: "Mais velocidade para testar.",
    icon: <Gauge className="h-4 w-4" />,
  },
  {
    value: "media",
    label: "Equilibrada",
    shortLabel: "Equilíbrio",
    hint: "Melhor custo-benefício.",
    icon: <LayoutTemplate className="h-4 w-4" />,
  },
  {
    value: "alta",
    label: "Premium",
    shortLabel: "Máxima",
    hint: "Mais refinamento visual.",
    icon: <Sparkles className="h-4 w-4" />,
  },
] as const;

const BASE_CANVAS_ITEM_ID = "active-base-reference";
const MAX_ACTIVE_JOBS = 2;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAssistantPanelDefaultSize(viewportWidth: number, viewportHeight: number): FloatingPanelSize {
  return {
    width: clamp(Math.round(viewportWidth * 0.25), 400, 460),
    height: clamp(Math.round(viewportHeight * 0.78), 560, viewportHeight - 28),
  };
}

function getSettingsPanelDefaultSize(
  viewportWidth: number,
  viewportHeight: number,
  _assistantWidth: number
): FloatingPanelSize {
  return {
    width:
      viewportWidth >= 1440
        ? clamp(Math.round(viewportWidth * 0.36), 520, 760)
        : clamp(viewportWidth - 32, 420, 720),
    height: clamp(Math.round(viewportHeight * 0.42), 360, Math.round(viewportHeight * 0.58)),
  };
}

function getDefaultPanelLayout(viewportWidth: number, viewportHeight: number) {
  const assistantSize = getAssistantPanelDefaultSize(viewportWidth, viewportHeight);
  const settingsSize = getSettingsPanelDefaultSize(viewportWidth, viewportHeight, assistantSize.width);

  return {
    assistantSize,
    settingsSize,
    assistantPosition: {
      x: Math.max(16, viewportWidth - assistantSize.width - 18),
      y: 84,
    },
    settingsPosition:
      viewportWidth >= 1440
        ? {
            x: 20,
            y: Math.max(108, viewportHeight - settingsSize.height - 20),
          }
        : {
            x: Math.max(16, Math.round((viewportWidth - settingsSize.width) / 2)),
            y: Math.max(108, viewportHeight - settingsSize.height - 20),
          },
  };
}

function getPanelMaxWidth(positionX: number, viewportWidth: number, fallback: number) {
  return Math.max(fallback, viewportWidth - positionX - 12);
}

function getPanelMaxHeight(positionY: number, viewportHeight: number, fallback: number) {
  return Math.max(fallback, viewportHeight - positionY - 12);
}

function getClampedPanelSize(
  size: FloatingPanelSize,
  options: {
    minWidth: number;
    minHeight: number;
    positionX: number;
    positionY: number;
    viewportWidth: number;
    viewportHeight: number;
    maxWidth?: number;
    maxHeight?: number;
  }
): FloatingPanelSize {
  const maxWidth = Math.min(
    options.maxWidth ?? Number.POSITIVE_INFINITY,
    getPanelMaxWidth(options.positionX, options.viewportWidth, options.minWidth)
  );
  const maxHeight = Math.min(
    options.maxHeight ?? Number.POSITIVE_INFINITY,
    getPanelMaxHeight(options.positionY, options.viewportHeight, options.minHeight)
  );

  return {
    width: clamp(size.width, options.minWidth, maxWidth),
    height: clamp(size.height, options.minHeight, maxHeight),
  };
}

function getAuthToken() {
  try {
    return JSON.parse(localStorage.getItem("auth-store") || "{}")?.state?.token || "";
  } catch {
    return "";
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatResolutionLabel(width: number, height: number) {
  return `${Math.round(width)}×${Math.round(height)}`;
}

function getFormatoFromDimensions(width?: number | null, height?: number | null) {
  if (!width || !height) return "quadrado_1_1";
  if (width === height) return "quadrado_1_1";
  return height > width ? "vertical_9_16" : "horizontal_16_9";
}

function getPreviewAspectRatio(formato: string, width?: number | null, height?: number | null) {
  if (width && height) return `${width} / ${height}`;
  if (formato === "vertical_9_16") return "9 / 16";
  if (formato === "horizontal_16_9") return "16 / 9";
  return "1 / 1";
}

function getNextCanvasPosition(items: CanvasItem[]) {
  const nonBaseCount = items.filter((item) => item.id !== BASE_CANVAS_ITEM_ID).length;
  const column = nonBaseCount % 3;
  const row = Math.floor(nonBaseCount / 3);
  return {
    x: 120 + column * 180,
    y: 80 + row * 140,
  };
}

function buildChatAttachments(baseReference: ReferenceAttachment | null): ChatAttachment[] {
  if (!baseReference) return [];
  return [
    {
      id: baseReference.id,
      label: "Base",
      name: baseReference.file.name,
      previewUrl: baseReference.previewUrl,
    },
  ];
}

async function fileFromUrl(url: string, filename: string) {
  if (url.startsWith("data:")) {
    return dataUrlToFile(url, filename);
  }
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

function FloatingPanel({
  title,
  subtitle,
  position,
  setPosition,
  size,
  setSize,
  className,
  minWidth = 360,
  minHeight = 280,
  maxWidth,
  maxHeight,
  bodyClassName,
  children,
}: {
  title: string;
  subtitle?: string;
  position: FloatingPosition;
  setPosition: React.Dispatch<React.SetStateAction<FloatingPosition>>;
  size: FloatingPanelSize;
  setSize: React.Dispatch<React.SetStateAction<FloatingPanelSize>>;
  className?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (dragRef.current) {
        const panelWidth = panelRef.current?.offsetWidth ?? size.width;
        const panelHeight = panelRef.current?.offsetHeight ?? size.height;
        const nextX = clamp(event.clientX - dragRef.current.pointerOffsetX, 12, Math.max(12, window.innerWidth - panelWidth - 12));
        const nextY = clamp(event.clientY - dragRef.current.pointerOffsetY, 12, Math.max(12, window.innerHeight - panelHeight - 12));
        setPosition({ x: nextX, y: nextY });
      }

      if (resizeRef.current) {
        const nextSize = getClampedPanelSize(
          {
            width: resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
            height: resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
          },
          {
            minWidth,
            minHeight,
            positionX: position.x,
            positionY: position.y,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            maxWidth,
            maxHeight,
          }
        );
        setSize(nextSize);
      }
    };

    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [maxHeight, maxWidth, minHeight, minWidth, position.x, position.y, setPosition, setSize, size.height, size.width]);

  useEffect(() => {
    const clampCurrentGeometry = () => {
      const panelWidth = panelRef.current?.offsetWidth ?? size.width;
      const panelHeight = panelRef.current?.offsetHeight ?? size.height;
      const nextPosition = {
        x: clamp(position.x, 12, Math.max(12, window.innerWidth - panelWidth - 12)),
        y: clamp(position.y, 12, Math.max(12, window.innerHeight - panelHeight - 12)),
      };

      setPosition((current) =>
        current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition
      );
      setSize((current) => {
        const nextSize = getClampedPanelSize(current, {
          minWidth,
          minHeight,
          positionX: nextPosition.x,
          positionY: nextPosition.y,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          maxWidth,
          maxHeight,
        });
        return nextSize.width === current.width && nextSize.height === current.height ? current : nextSize;
      });
    };

    clampCurrentGeometry();
    window.addEventListener("resize", clampCurrentGeometry);
    return () => window.removeEventListener("resize", clampCurrentGeometry);
  }, [maxHeight, maxWidth, minHeight, minWidth, position.x, position.y, setPosition, setSize, size.height, size.width]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-30 flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,16,28,0.98)_0%,rgba(6,10,20,0.98)_100%)] shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        className
      )}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
    >
      <div
        className="flex cursor-move items-center justify-between border-b border-white/10 px-4 py-3"
        onMouseDown={(event) => {
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = {
            pointerOffsetX: event.clientX - rect.left,
            pointerOffsetY: event.clientY - rect.top,
          };
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-white ring-1 ring-white/10">
            <GripHorizontal className="h-4 w-4 text-slate-300" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            {subtitle ? <div className="truncate text-[11px] text-slate-400">{subtitle}</div> : null}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-1 md:inline-flex">
            Arraste o canto para redimensionar
          </span>
          <Move className="h-4 w-4 text-slate-500" />
        </div>
      </div>

      <div className={cn("image-engine-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden", bodyClassName)}>
        {children}
      </div>

      <button
        type="button"
        aria-label={`Redimensionar ${title}`}
        className="absolute bottom-3 right-3 z-10 flex h-8 w-8 cursor-nwse-resize items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-slate-300 shadow-lg transition hover:border-blue-400/30 hover:bg-slate-900"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          resizeRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: panelRef.current?.offsetWidth ?? size.width,
            startHeight: panelRef.current?.offsetHeight ?? size.height,
          };
          document.body.style.cursor = "nwse-resize";
          document.body.style.userSelect = "none";
        }}
      >
        <span className="block h-3.5 w-3.5 border-b-2 border-r-2 border-current" />
      </button>
    </div>
  );
}

type Props = {
  onBack: () => void;
};


type ProjectSnapshot = {
  formato: string;
  qualidade: string;
  resolutionMode: "preset" | "custom";
  customWidth: string;
  customHeight: string;
  preserveOriginalFrame: boolean;
  allowResizeCrop: boolean;
  promptInput: string;
  statusText: string;
  messages: ChatMessage[];
  baseReference: ReferenceAttachment | null;
  canvasItems: CanvasItem[];
  selectedItemId: string | null;
  viewport: {
    scale: number;
    x: number;
    y: number;
  };
  hasManualViewport: boolean;
};

type ProjectItem = {
  id: string;
  name: string;
  snapshot: ProjectSnapshot;
};

type PersistedBaseReference = {
  id: string;
  kind: "base";
  name: string;
  mimeType: string;
  previewUrl: string;
  width: number;
  height: number;
};

type PersistedProjectSnapshot = Omit<ProjectSnapshot, "baseReference" | "canvasItems"> & {
  baseReference: PersistedBaseReference | null;
  canvasItems: CanvasItem[];
};

type PersistedProjectItem = {
  id: string;
  name: string;
  position: number;
  snapshot: PersistedProjectSnapshot;
  is_current: boolean;
  updated_at?: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Não foi possível converter o arquivo para data URL."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo da base."));
    reader.readAsDataURL(file);
  });
}

function isDataUrl(value: string) {
  return typeof value === "string" && value.startsWith("data:");
}

function createInitialAssistantMessages(): ChatMessage[] {
  return [
    {
      id: makeId(),
      role: "assistant",
      content:
        "Este editor trabalha com uma imagem-base fixa no canvas. Envie sua base e descreva exatamente o que precisa mudar.",
    },
  ];
}

function createDefaultProjectSnapshot(): ProjectSnapshot {
  return {
    formato: "quadrado_1_1",
    qualidade: "media",
    resolutionMode: "preset",
    customWidth: "1024",
    customHeight: "1280",
    preserveOriginalFrame: true,
    allowResizeCrop: false,
    promptInput: "",
    statusText: "Carregue uma base e descreva a alteração.",
    messages: createInitialAssistantMessages(),
    baseReference: null,
    canvasItems: [],
    selectedItemId: null,
    viewport: {
      scale: 0.42,
      x: 120,
      y: 96,
    },
    hasManualViewport: false,
  };
}

function createProjectItem(index: number): ProjectItem {
  return {
    id: `project-${makeId()}`,
    name: `Projeto ${index}`,
    snapshot: createDefaultProjectSnapshot(),
  };
}

async function serializeProjectSnapshot(
  snapshot: ProjectSnapshot,
  getBaseDataUrl: (reference: ReferenceAttachment) => Promise<string>
): Promise<PersistedProjectSnapshot> {
  const baseDataUrl = snapshot.baseReference ? await getBaseDataUrl(snapshot.baseReference) : null;
  const persistedBaseReference: PersistedBaseReference | null = snapshot.baseReference
    ? {
        id: snapshot.baseReference.id,
        kind: "base",
        name: snapshot.baseReference.file.name || "base.png",
        mimeType: snapshot.baseReference.file.type || "image/png",
        previewUrl: baseDataUrl || "",
        width: snapshot.baseReference.width,
        height: snapshot.baseReference.height,
      }
    : null;

  const persistedCanvasItems = snapshot.canvasItems
    .filter((item) => item.kind !== "pending")
    .map((item) => {
      if (item.kind === "base" && persistedBaseReference) {
        return {
          ...item,
          url: persistedBaseReference.previewUrl,
          naturalWidth: persistedBaseReference.width,
          naturalHeight: persistedBaseReference.height,
        };
      }
      return item;
    });

  return {
    ...snapshot,
    baseReference: persistedBaseReference,
    canvasItems: persistedCanvasItems,
  };
}

async function deserializeProjectSnapshot(snapshot?: PersistedProjectSnapshot | null): Promise<ProjectSnapshot> {
  const fallback = createDefaultProjectSnapshot();
  if (!snapshot) return fallback;

  let baseReference: ReferenceAttachment | null = null;

  if (snapshot.baseReference?.previewUrl) {
    const baseFile = await dataUrlToFile(
      snapshot.baseReference.previewUrl,
      snapshot.baseReference.name || "base.png"
    );

    baseReference = {
      id: snapshot.baseReference.id || makeId(),
      kind: "base",
      file: baseFile,
      previewUrl: snapshot.baseReference.previewUrl,
      width: snapshot.baseReference.width || 1,
      height: snapshot.baseReference.height || 1,
    };
  }

  const canvasItems = Array.isArray(snapshot.canvasItems)
    ? snapshot.canvasItems
        .filter((item) => item && item.kind !== "pending")
        .map((item) => {
          if (item.kind === "base" && baseReference) {
            return {
              ...item,
              url: baseReference.previewUrl,
              naturalWidth: baseReference.width,
              naturalHeight: baseReference.height,
            };
          }
          return item;
        })
    : [];

  return {
    ...fallback,
    ...snapshot,
    messages:
      Array.isArray(snapshot.messages) && snapshot.messages.length > 0
        ? snapshot.messages
        : createInitialAssistantMessages(),
    baseReference,
    canvasItems,
    selectedItemId:
      snapshot.selectedItemId && canvasItems.some((item) => item.id === snapshot.selectedItemId)
        ? snapshot.selectedItemId
        : canvasItems[0]?.id ?? null,
    viewport: snapshot.viewport ?? fallback.viewport,
    hasManualViewport: Boolean(snapshot.hasManualViewport),
  };
}

export default function ImageEditReferenceView({ onBack }: Props) {
  const [projectSeed] = useState<ProjectItem>(() => createProjectItem(1));
  const [projects, setProjects] = useState<ProjectItem[]>([projectSeed]);
  const [currentProjectId, setCurrentProjectId] = useState(projectSeed.id);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [formato, setFormato] = useState<string>(projectSeed.snapshot.formato);
  const [qualidade, setQualidade] = useState<string>(projectSeed.snapshot.qualidade);
  const [resolutionMode, setResolutionMode] = useState<"preset" | "custom">(projectSeed.snapshot.resolutionMode);
  const [customWidth, setCustomWidth] = useState<string>(projectSeed.snapshot.customWidth);
  const [customHeight, setCustomHeight] = useState<string>(projectSeed.snapshot.customHeight);
  const [preserveOriginalFrame, setPreserveOriginalFrame] = useState(projectSeed.snapshot.preserveOriginalFrame);
  const [allowResizeCrop, setAllowResizeCrop] = useState(projectSeed.snapshot.allowResizeCrop);
  const [promptInput, setPromptInput] = useState(projectSeed.snapshot.promptInput);
  const [statusText, setStatusText] = useState(projectSeed.snapshot.statusText);
  const [dragActive, setDragActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(projectSeed.snapshot.messages);
  const [baseReference, setBaseReference] = useState<ReferenceAttachment | null>(projectSeed.snapshot.baseReference);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>(projectSeed.snapshot.canvasItems);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(projectSeed.snapshot.selectedItemId);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [viewport, setViewport] = useState(projectSeed.snapshot.viewport);
  const [hasManualViewport, setHasManualViewport] = useState(projectSeed.snapshot.hasManualViewport);
  const [assistantPanelPosition, setAssistantPanelPosition] = useState<FloatingPosition>({ x: 0, y: 0 });
  const [assistantPanelSize, setAssistantPanelSize] = useState<FloatingPanelSize>({ width: 0, height: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1600,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  });

  const baseInputRef = useRef<HTMLInputElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const activeJobsRef = useRef(new Map<string, AbortController>());
  const createdObjectUrlsRef = useRef<string[]>([]);
  const canvasItemsRef = useRef<CanvasItem[]>([]);
  const panningRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const draggingItemRef = useRef<{ itemId: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const lastStatusByJobRef = useRef<Record<string, string>>({});

const projectsRef = useRef<ProjectItem[]>([projectSeed]);
const projectHydratingRef = useRef(false);
const baseDataUrlCacheRef = useRef<Record<string, string>>({});
const persistProjectsTimeoutRef = useRef<number | null>(null);
const [projectsReady, setProjectsReady] = useState(false);
const [projectsLoading, setProjectsLoading] = useState(true);



useEffect(() => {
  projectsRef.current = projects;
}, [projects]);
  const currentQuality = useMemo(
    () => QUALITY_OPTIONS.find((option) => option.value === qualidade) ?? QUALITY_OPTIONS[1],
    [qualidade]
  );
  const assistantPanelDefaultSize = useMemo(
    () => getAssistantPanelDefaultSize(viewportSize.width, viewportSize.height),
    [viewportSize.height, viewportSize.width]
  );
  const effectiveAssistantPanelSize = assistantPanelSize.width > 0 ? assistantPanelSize : assistantPanelDefaultSize;
  const canvasInsets = useMemo(
    () => ({
      top: 92,
      left: 16,
      right: 16,
      bottom: 16,
    }),
    []
  );
  const parsedCustomWidth = useMemo(() => Number(customWidth), [customWidth]);
  const parsedCustomHeight = useMemo(() => Number(customHeight), [customHeight]);


const currentProject = useMemo(
  () => projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? projectSeed,
  [currentProjectId, projectSeed, projects]
);

const getPersistableBaseDataUrl = useCallback(async (reference: ReferenceAttachment) => {
  const cached = baseDataUrlCacheRef.current[reference.id];
  if (cached) return cached;

  const nextDataUrl = isDataUrl(reference.previewUrl)
    ? reference.previewUrl
    : await fileToDataUrl(reference.file);

  baseDataUrlCacheRef.current[reference.id] = nextDataUrl;
  return nextDataUrl;
}, []);

const fetchProjectsJson = useCallback(
  async (path: string, init?: RequestInit) => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Sessão expirada.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "Sessão expirada." : `Erro ${response.status}`);
    }

    return await response.json();
  },
  []
);

const hydrateProjectFromServer = useCallback(async (project: PersistedProjectItem): Promise<ProjectItem> => {
  const snapshot = await deserializeProjectSnapshot(project.snapshot);
  return {
    id: project.id,
    name: project.name || "Projeto",
    snapshot,
  };
}, []);

const createProjectOnServer = useCallback(
  async (name: string, snapshot: ProjectSnapshot, position: number, isCurrent: boolean) => {
    const persistedSnapshot = await serializeProjectSnapshot(snapshot, getPersistableBaseDataUrl);
    const data = await fetchProjectsJson("/api/image-engine/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        position,
        is_current: isCurrent,
        snapshot: persistedSnapshot,
      }),
    });

    return await hydrateProjectFromServer(data.project as PersistedProjectItem);
  },
  [fetchProjectsJson, getPersistableBaseDataUrl, hydrateProjectFromServer]
);

const persistProjectsToServer = useCallback(
  async (projectsToPersist: ProjectItem[], currentId: string) => {
    await Promise.all(
      projectsToPersist.map(async (project, index) => {
        const persistedSnapshot = await serializeProjectSnapshot(project.snapshot, getPersistableBaseDataUrl);
        await fetchProjectsJson(`/api/image-engine/projects/${project.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: project.name,
            position: index,
            is_current: project.id === currentId,
            snapshot: persistedSnapshot,
          }),
        });
      })
    );
  },
  [fetchProjectsJson, getPersistableBaseDataUrl]
);

const applyProjectSnapshot = useCallback((snapshot: ProjectSnapshot) => {
  projectHydratingRef.current = true;

  setFormato(snapshot.formato);
  setQualidade(snapshot.qualidade);
  setResolutionMode(snapshot.resolutionMode);
  setCustomWidth(snapshot.customWidth);
  setCustomHeight(snapshot.customHeight);
  setPreserveOriginalFrame(snapshot.preserveOriginalFrame);
  setAllowResizeCrop(snapshot.allowResizeCrop);
  setPromptInput(snapshot.promptInput);
  setStatusText(snapshot.statusText);
  setMessages(snapshot.messages);
  setBaseReference(snapshot.baseReference);
  setCanvasItems(snapshot.canvasItems);
  setSelectedItemId(snapshot.selectedItemId);
  setViewport(snapshot.viewport);
  setHasManualViewport(snapshot.hasManualViewport);
  setActiveJobs([]);
  setIsProjectsOpen(false);

  requestAnimationFrame(() => {
    projectHydratingRef.current = false;
  });
}, []);

const buildProjectSnapshot = useCallback(
  (): ProjectSnapshot => ({
    formato,
    qualidade,
    resolutionMode,
    customWidth,
    customHeight,
    preserveOriginalFrame,
    allowResizeCrop,
    promptInput,
    statusText,
    messages,
    baseReference,
    canvasItems,
    selectedItemId,
    viewport,
    hasManualViewport,
  }),
  [
    allowResizeCrop,
    baseReference,
    canvasItems,
    customHeight,
    customWidth,
    formato,
    hasManualViewport,
    messages,
    preserveOriginalFrame,
    promptInput,
    qualidade,
    resolutionMode,
    selectedItemId,
    statusText,
    viewport,
  ]
);


const syncProjectSnapshotInList = useCallback(
  (projectsList: ProjectItem[], projectId: string, snapshot: ProjectSnapshot) => {
    let found = false;
    const nextProjects = projectsList.map((project) => {
      if (project.id !== projectId) return project;
      found = true;
      return {
        ...project,
        snapshot,
      };
    });

    return found ? nextProjects : projectsList;
  },
  []
);

const commitCurrentProjectSnapshot = useCallback(
  (snapshotOverride?: ProjectSnapshot) => {
    const nextSnapshot = snapshotOverride ?? buildProjectSnapshot();
    const nextProjects = syncProjectSnapshotInList(projectsRef.current, currentProjectId, nextSnapshot);
    projectsRef.current = nextProjects;
    setProjects(nextProjects);
    return nextProjects;
  },
  [buildProjectSnapshot, currentProjectId, syncProjectSnapshotInList]
);

useEffect(() => {
  let cancelled = false;

  const loadProjects = async () => {
    try {
      const data = await fetchProjectsJson("/api/image-engine/projects", {
        method: "GET",
      });
      if (cancelled) return;

      const serverProjects = Array.isArray(data?.projects) ? (data.projects as PersistedProjectItem[]) : [];
      let hydratedProjects: ProjectItem[] = [];

      if (serverProjects.length === 0) {
        const defaultProject = createProjectItem(1);
        const createdProject = await createProjectOnServer(defaultProject.name, defaultProject.snapshot, 0, true);
        hydratedProjects = [createdProject];
      } else {
        hydratedProjects = await Promise.all(serverProjects.map((project) => hydrateProjectFromServer(project)));
      }

      if (cancelled) return;

      const currentServerProject =
        serverProjects.find((project) => project.is_current) ??
        serverProjects[0];

      const nextCurrentProjectId =
        currentServerProject?.id ??
        hydratedProjects[0]?.id ??
        projectSeed.id;

      const targetProject =
        hydratedProjects.find((project) => project.id === nextCurrentProjectId) ??
        hydratedProjects[0] ??
        projectSeed;

      setProjects(hydratedProjects.length > 0 ? hydratedProjects : [targetProject]);
      setCurrentProjectId(targetProject.id);
      applyProjectSnapshot(targetProject.snapshot);
      setProjectsReady(true);
      setProjectsLoading(false);
    } catch (error) {
      console.error("Falha ao carregar projetos do editor:", error);
      setProjectsReady(true);
      setProjectsLoading(false);
    }
  };

  loadProjects();

  return () => {
    cancelled = true;
  };
}, [applyProjectSnapshot, createProjectOnServer, fetchProjectsJson, hydrateProjectFromServer, projectSeed.id]);

useEffect(() => {
  if (!projectsReady || projectHydratingRef.current) return;
  void commitCurrentProjectSnapshot();
}, [commitCurrentProjectSnapshot, projectsReady]);

useEffect(() => {
  if (!projectsReady || projectHydratingRef.current) return;
  if (persistProjectsTimeoutRef.current) {
    window.clearTimeout(persistProjectsTimeoutRef.current);
  }

  persistProjectsTimeoutRef.current = window.setTimeout(() => {
    void persistProjectsToServer(projectsRef.current, currentProjectId).catch((error) => {
      console.error("Falha ao persistir projetos do editor:", error);
    });
  }, 700);

  return () => {
    if (persistProjectsTimeoutRef.current) {
      window.clearTimeout(persistProjectsTimeoutRef.current);
      persistProjectsTimeoutRef.current = null;
    }
  };
}, [currentProjectId, persistProjectsToServer, projects, projectsReady]);

const dockPanels = useCallback(() => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const layout = getDefaultPanelLayout(width, height);

  setViewportSize({ width, height });
  setAssistantPanelSize(layout.assistantSize);
  setAssistantPanelPosition(layout.assistantPosition);
}, []);


const abortActiveJobsForProjectSwitch = useCallback(() => {
  for (const controller of activeJobsRef.current.values()) {
    controller.abort();
  }
  activeJobsRef.current.clear();
  setActiveJobs([]);
}, []);

const handleCreateProject = useCallback(async () => {
  abortActiveJobsForProjectSwitch();
  const syncedProjects = commitCurrentProjectSnapshot();

  const templateProject = createProjectItem(syncedProjects.length + 1);

  try {
    const nextProject = await createProjectOnServer(
      templateProject.name,
      templateProject.snapshot,
      syncedProjects.length,
      true
    );

    const nextProjects = [...projectsRef.current, nextProject];
    projectsRef.current = nextProjects;
    setProjects(nextProjects);
    setCurrentProjectId(nextProject.id);
    applyProjectSnapshot(nextProject.snapshot);
  } catch (error) {
    console.error("Falha ao criar projeto no servidor:", error);
    setStatusText("Não foi possível criar o projeto no servidor.");
  }
}, [abortActiveJobsForProjectSwitch, applyProjectSnapshot, commitCurrentProjectSnapshot, createProjectOnServer]);

const handleSelectProject = useCallback(
  (projectId: string) => {
    if (projectId === currentProjectId) {
      setIsProjectsOpen(false);
      return;
    }

    abortActiveJobsForProjectSwitch();
    const syncedProjects = commitCurrentProjectSnapshot();

    const targetProject = syncedProjects.find((project) => project.id === projectId);
    if (!targetProject) return;

    setCurrentProjectId(projectId);
    applyProjectSnapshot(targetProject.snapshot);
  },
  [abortActiveJobsForProjectSwitch, applyProjectSnapshot, commitCurrentProjectSnapshot, currentProjectId]
);

  const hasValidCustomDimensions =
    Number.isInteger(parsedCustomWidth) &&
    Number.isInteger(parsedCustomHeight) &&
    parsedCustomWidth >= 256 &&
    parsedCustomWidth <= 4096 &&
    parsedCustomHeight >= 256 &&
    parsedCustomHeight <= 4096;

  const effectiveFormato = useMemo(
    () =>
      resolutionMode === "custom" && hasValidCustomDimensions
        ? getFormatoFromDimensions(parsedCustomWidth, parsedCustomHeight)
        : formato,
    [formato, hasValidCustomDimensions, parsedCustomHeight, parsedCustomWidth, resolutionMode]
  );
  const currentFormat = useMemo(
    () => FORMAT_OPTIONS.find((option) => option.value === effectiveFormato) ?? FORMAT_OPTIONS[0],
    [effectiveFormato]
  );
  const currentFormatBadgeLabel = useMemo(
    () =>
      resolutionMode === "custom" && hasValidCustomDimensions
        ? formatResolutionLabel(parsedCustomWidth, parsedCustomHeight)
        : currentFormat.shortLabel,
    [currentFormat.shortLabel, hasValidCustomDimensions, parsedCustomHeight, parsedCustomWidth, resolutionMode]
  );
  const currentResizeBehaviorLabel = useMemo(() => {
    if (preserveOriginalFrame) return "Expand sem crop";
    if (resolutionMode === "custom" && hasValidCustomDimensions && allowResizeCrop) return "Crop exato";
    if (resolutionMode === "custom" && hasValidCustomDimensions) return "Ajuste exato sem crop";
    if (!allowResizeCrop) return "Sem resize exato";
    return "Crop exato";
  }, [allowResizeCrop, hasValidCustomDimensions, preserveOriginalFrame, resolutionMode]);


  const previewAspectRatio = getPreviewAspectRatio(
    formato,
    resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomWidth : undefined,
    resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomHeight : undefined
  );

  const resultsCount = useMemo(
    () => canvasItems.filter((item) => item.kind === "result").length,
    [canvasItems]
  );

  useEffect(() => {
    canvasItemsRef.current = canvasItems;
  }, [canvasItems]);

  useEffect(() => {
  const syncViewportMetrics = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const layout = getDefaultPanelLayout(width, height);

    setViewportSize({ width, height });
    setAssistantPanelSize((current) => {
      if (current.width === 0 && current.height === 0) {
        return layout.assistantSize;
      }
      const nextSize = getClampedPanelSize(current, {
        minWidth: 400,
        minHeight: 520,
        positionX: assistantPanelPosition.x || layout.assistantPosition.x,
        positionY: assistantPanelPosition.y || layout.assistantPosition.y,
        viewportWidth: width,
        viewportHeight: height,
        maxWidth: 460,
        maxHeight: height - 16,
      });
      return nextSize.width === current.width && nextSize.height === current.height ? current : nextSize;
    });
    setAssistantPanelPosition((current) =>
      current.x === 0 && current.y === 0 ? layout.assistantPosition : current
    );
  };

  syncViewportMetrics();
  window.addEventListener("resize", syncViewportMetrics);
  return () => window.removeEventListener("resize", syncViewportMetrics);
}, [assistantPanelPosition.x, assistantPanelPosition.y]);



  useEffect(() => {
    return () => {
      for (const controller of activeJobsRef.current.values()) {
        controller.abort();
      }
      for (const url of createdObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);



  useEffect(() => {
    dockPanels();
  }, [dockPanels]);

  useEffect(() => {
    if (!chatViewportRef.current) return;
    chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const pan = panningRef.current;
      if (pan) {
        const nextX = pan.originX + (event.clientX - pan.startX);
        const nextY = pan.originY + (event.clientY - pan.startY);

        setViewport((current) => ({
          ...current,
          x: nextX,
          y: nextY,
        }));
        setHasManualViewport(true);
      }

      if (draggingItemRef.current) {
        const drag = draggingItemRef.current;
        const deltaX = (event.clientX - drag.startX) / Math.max(0.05, viewport.scale);
        const deltaY = (event.clientY - drag.startY) / Math.max(0.05, viewport.scale);
        setCanvasItems((current) =>
          current.map((item) =>
            item.id === drag.itemId
              ? { ...item, x: drag.originX + deltaX, y: drag.originY + deltaY }
              : item
          )
        );
      }
    };

    const onUp = () => {
      panningRef.current = null;
      draggingItemRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [viewport.scale]);

  const registerPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    createdObjectUrlsRef.current.push(url);
    return url;
  }, []);

  const fitCanvasToItems = useCallback((itemsOverride?: CanvasItem[]) => {
    const viewportElement = canvasViewportRef.current;
    const items = (itemsOverride ?? canvasItemsRef.current).filter(Boolean);
    if (!viewportElement || items.length === 0) return;

    const bounds = items.reduce(
      (acc, item) => {
        acc.minX = Math.min(acc.minX, item.x);
        acc.minY = Math.min(acc.minY, item.y);
        acc.maxX = Math.max(acc.maxX, item.x + item.width);
        acc.maxY = Math.max(acc.maxY, item.y + item.height);
        return acc;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return;

    const padding = 96;
    const sceneWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sceneHeight = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(320, viewportElement.clientWidth - padding * 2);
    const availableHeight = Math.max(240, viewportElement.clientHeight - padding * 2);
    const nextScale = clamp(Math.min(availableWidth / sceneWidth, availableHeight / sceneHeight, 1), 0.08, 2.8);
    const nextX = viewportElement.clientWidth / 2 - (bounds.minX + sceneWidth / 2) * nextScale;
    const nextY = viewportElement.clientHeight / 2 - (bounds.minY + sceneHeight / 2) * nextScale;
    setViewport({ scale: nextScale, x: nextX, y: nextY });
  }, []);

  const pushAssistantMessage = useCallback(
    (
      content: string,
      tone: ChatMessage["tone"] = "default",
      attachments?: ChatAttachment[]
    ) => {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content,
          tone,
          attachments,
        },
      ]);
    },
    []
  );

  const pushUserMessage = useCallback((content: string, attachments?: ChatAttachment[]) => {
    setMessages((current) => [
      ...current,
      {
        id: makeId(),
        role: "user",
        content,
        attachments,
      },
    ]);
  }, []);

  const upsertBaseCanvasItem = useCallback((reference: ReferenceAttachment) => {
    const nextBaseItem: CanvasItem = {
      id: BASE_CANVAS_ITEM_ID,
      kind: "base",
      url: reference.previewUrl,
      title: "Base ativa",
      subtitle: reference.file.name,
      x: 0,
      y: 0,
      width: reference.width,
      height: reference.height,
      naturalWidth: reference.width,
      naturalHeight: reference.height,
      status: "Base pronta",
      progress: 100,
    };

    setCanvasItems((current) => {
      const previousBase = current.find((item) => item.id === BASE_CANVAS_ITEM_ID);
      const otherItems = current.filter((item) => item.id !== BASE_CANVAS_ITEM_ID);
      const archivedPreviousBase =
        previousBase && previousBase.url !== nextBaseItem.url
          ? [
              {
                ...previousBase,
                id: `archived-base-${makeId()}`,
                kind: "result" as const,
                title: previousBase.title || "Base anterior",
                subtitle: previousBase.subtitle || "Base anterior preservada no canvas",
                status: "Base anterior preservada",
              },
            ]
          : [];

      return [nextBaseItem, ...archivedPreviousBase, ...otherItems];
    });
    setSelectedItemId(BASE_CANVAS_ITEM_ID);
    setStatusText(`Base ativa: ${reference.file.name}`);
  }, []);

  const loadReferenceAttachment = useCallback(
    async (file: File): Promise<ReferenceAttachment> => {
      const previewUrl = registerPreviewUrl(file);
      const dimensions = await readImageDimensionsFromUrl(previewUrl);
      return {
        id: makeId(),
        kind: "base",
        file,
        previewUrl,
        width: dimensions.width,
        height: dimensions.height,
      };
    },
    [registerPreviewUrl]
  );

  const validateFiles = useCallback((files: File[]) => {
    const accepted = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const validFiles = files.filter((file) => accepted.includes(file.type));
    if (validFiles.length !== files.length) {
      pushAssistantMessage("Alguns arquivos foram ignorados porque não são PNG, JPG, JPEG ou WEBP.", "warning");
    }
    return validFiles;
  }, [pushAssistantMessage]);

  const handleBaseFileSelection = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      const [validFile] = validateFiles([file]);
      if (!validFile) return;

      const attachment = await loadReferenceAttachment(validFile);
      setBaseReference(attachment);
      upsertBaseCanvasItem(attachment);
      setStatusText(`Base ativa: ${attachment.file.name}`);
      requestAnimationFrame(() => fitCanvasToItems());
    },
    [fitCanvasToItems, loadReferenceAttachment, upsertBaseCanvasItem, validateFiles]
  );

  const updateCanvasItem = useCallback((itemId: string, patch: Partial<CanvasItem>) => {
    setCanvasItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  }, []);

  const useCanvasItemAsBase = useCallback(
    async (item: CanvasItem) => {
      try {
        const file = await fileFromUrl(item.url, `${item.kind === "result" ? "resultado" : "base"}-${Date.now()}.png`);
        const nextBase = await loadReferenceAttachment(file);
        setBaseReference(nextBase);
        upsertBaseCanvasItem(nextBase);
        requestAnimationFrame(() => fitCanvasToItems());
        pushAssistantMessage("Pronto. Essa imagem agora é a nova base ativa para as próximas edições.", "success");
      } catch {
        pushAssistantMessage("Não consegui transformar essa imagem em nova base agora.", "warning");
      }
    },
    [fitCanvasToItems, loadReferenceAttachment, pushAssistantMessage, upsertBaseCanvasItem]
  );

  const removeCanvasItem = useCallback((itemId: string) => {
    if (itemId === BASE_CANVAS_ITEM_ID) {
      pushAssistantMessage("A base ativa não pode ser removida daqui. Troque a base por outra imagem.", "warning");
      return;
    }
    setCanvasItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedItemId((current) => (current === itemId ? BASE_CANVAS_ITEM_ID : current));
  }, [pushAssistantMessage]);

  const finalizeJobOnCanvas = useCallback(
    async (pendingCanvasItemId: string, result: ImageResult, instruction: string) => {
      const dimensions = await readImageDimensionsFromUrl(result.url).catch(() => ({
        width: baseReference?.width || 1024,
        height: baseReference?.height || 1024,
      }));

      updateCanvasItem(pendingCanvasItemId, {
        kind: "result",
        title: `Resultado ${resultsCount + 1}`,
        subtitle: instruction,
        url: result.url,
        width: dimensions.width,
        height: dimensions.height,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        progress: 100,
        status: "Pronto",
        engineId: result.engine_id,
        motor: result.motor,
        prompt: instruction,
      });
      setSelectedItemId(pendingCanvasItemId);

      await appendImageHistory([
        {
          type: "edited",
          url: result.url,
          motor: result.motor,
          engine_id: result.engine_id,
          format: formato,
          quality: qualidade,
          width: resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomWidth : undefined,
          height: resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomHeight : undefined,
          prompt: instruction,
        },
      ]);
    },
    [
      allowResizeCrop,
      baseReference?.height,
      baseReference?.width,
      formato,
      hasValidCustomDimensions,
      parsedCustomHeight,
      parsedCustomWidth,
      qualidade,
      resolutionMode,
      resultsCount,
      updateCanvasItem,
    ]
  );

  const handleGenerate = useCallback(
    async (manualInstruction?: string) => {
      const instruction = (manualInstruction ?? promptInput).trim();

      if (!baseReference) {
        pushAssistantMessage("Antes de pedir uma edição, você precisa carregar a imagem-base.", "warning");
        setStatusText("Sem base ativa.");
        return;
      }

      if (!instruction) {
        pushAssistantMessage("Descreva o que deve mudar na imagem para eu começar.", "warning");
        return;
      }

      if (activeJobsRef.current.size >= MAX_ACTIVE_JOBS) {
        pushAssistantMessage(`No canvas você pode manter até ${MAX_ACTIVE_JOBS} processamentos em paralelo. Aguarde um concluir para abrir outro.`, "warning");
        return;
      }

      if (resolutionMode === "custom" && !hasValidCustomDimensions) {
        pushAssistantMessage("As dimensões customizadas precisam estar entre 256 e 4096 pixels.", "warning");
        return;
      }

      const pendingCanvasItemId = `pending-${makeId()}`;
      const position = getNextCanvasPosition(canvasItemsRef.current);
      const controller = new AbortController();
      const jobId = makeId();
      const attachments = buildChatAttachments(baseReference);

      activeJobsRef.current.set(jobId, controller);
      setActiveJobs((current) => [
        ...current,
        {
          id: jobId,
          instruction,
          pendingCanvasItemId,
          progress: 8,
          status: "Preparando envio",
        },
      ]);
      setStatusText("Preparando nova edição...");
      pushUserMessage(instruction, attachments);
      setPromptInput("");

      const placeholderWidth =
        resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomWidth : baseReference.width;
      const placeholderHeight =
        resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomHeight : baseReference.height;

      setCanvasItems((current) => [
        ...current,
        {
          id: pendingCanvasItemId,
          kind: "pending",
          url: baseReference.previewUrl,
          title: `Preview ${current.filter((item) => item.id !== BASE_CANVAS_ITEM_ID).length + 1}`,
          subtitle: instruction,
          status: "Preparando prompt...",
          progress: 8,
          x: position.x,
          y: position.y,
          width: placeholderWidth,
          height: placeholderHeight,
          naturalWidth: placeholderWidth,
          naturalHeight: placeholderHeight,
          prompt: instruction,
        },
      ]);
      setSelectedItemId(pendingCanvasItemId);

      const formData = new FormData();
      formData.append("reference_image", baseReference.file);
      formData.append("formato", effectiveFormato);
      formData.append("qualidade", qualidade);
      formData.append("instrucoes_edicao", instruction);
      formData.append("preserve_original_frame", String(preserveOriginalFrame));
      formData.append("allow_resize_crop", String(allowResizeCrop));

      if (resolutionMode === "custom" && hasValidCustomDimensions) {
        formData.append("width", String(parsedCustomWidth));
        formData.append("height", String(parsedCustomHeight));
      }

      const token = getAuthToken();

      try {
        const response = await fetch(`${API_BASE_URL}/api/image-engine/edit/stream`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          body: formData,
          signal: controller.signal,
        });

        syncCreditsFromResponse(response);

        if (!response.ok) {
          throw new Error(await extractResponseErrorMessage(response));
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Falha ao abrir o stream de resposta.");
        }

        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let streamFinishedWithResult = false;

        readStream: while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const line = rawEvent
              .split("\n")
              .find((item) => item.startsWith("data:"));
            if (!line) continue;

            const payload = JSON.parse(line.replace(/^data:\s*/, ""));

            if (payload.error) {
              throw new Error(payload.error);
            }

            if (payload.status) {
              setStatusText(payload.status);
              updateCanvasItem(pendingCanvasItemId, {
                status: payload.status,
                progress: typeof payload.progress === "number" ? payload.progress : undefined,
              });
              setActiveJobs((current) =>
                current.map((job) =>
                  job.id === jobId
                    ? {
                        ...job,
                        status: payload.status,
                        progress: typeof payload.progress === "number" ? payload.progress : job.progress,
                      }
                    : job
                )
              );

              if (lastStatusByJobRef.current[jobId] !== payload.status) {
                lastStatusByJobRef.current[jobId] = payload.status;
                pushAssistantMessage(payload.status);
              }
            }

            if (payload.warning) {
              pushAssistantMessage(payload.warning, "warning");
            }

            if (payload.partial_result?.url) {
              updateCanvasItem(pendingCanvasItemId, {
                url: payload.partial_result.url,
                motor: payload.partial_result.motor,
                engineId: payload.partial_result.engine_id,
              });
            }

            if (Array.isArray(payload.final_results) && payload.final_results[0]?.url) {
              await finalizeJobOnCanvas(pendingCanvasItemId, payload.final_results[0], instruction);
              streamFinishedWithResult = true;
              setStatusText("Entrega concluída.");
              try {
                await reader.cancel();
              } catch {
                // noop
              }
              break readStream;
            }
          }
        }

        if (streamFinishedWithResult) {
          pushAssistantMessage(
            "Entrega concluída. A prévia está no canvas e você já pode abrir um novo pedido.",
            "success"
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const message = error instanceof Error ? error.message : "Falha inesperada na edição.";
        setStatusText(message);
        updateCanvasItem(pendingCanvasItemId, {
          status: message,
          progress: 100,
        });
        pushAssistantMessage(message, "warning");
      } finally {
        activeJobsRef.current.delete(jobId);
        setActiveJobs((current) => current.filter((item) => item.id !== jobId));
      }
    },
    [
      allowResizeCrop,
      baseReference,
      finalizeJobOnCanvas,
      formato,
      hasValidCustomDimensions,
      parsedCustomHeight,
      parsedCustomWidth,
      promptInput,
      pushAssistantMessage,
      pushUserMessage,
      qualidade,
      resolutionMode,
      updateCanvasItem,
    ]
  );

const startCanvasPan = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
  const usingMiddleButton = event.button === 1;
  const usingLeftOnEmptyArea = event.button === 0 && event.target === event.currentTarget;

  if (!usingMiddleButton && !usingLeftOnEmptyArea) return;

  event.preventDefault();
  panningRef.current = {
    startX: event.clientX,
    startY: event.clientY,
    originX: viewport.x,
    originY: viewport.y,
  };
  document.body.style.cursor = "grabbing";
  document.body.style.userSelect = "none";
}, [viewport.x, viewport.y]);

  const startCanvasItemDrag = useCallback((event: React.MouseEvent<HTMLDivElement>, item: CanvasItem) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedItemId(item.id);
    draggingItemRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, []);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextScale = clamp(viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08), 0.08, 3);
    const originX = (pointerX - viewport.x) / viewport.scale;
    const originY = (pointerY - viewport.y) / viewport.scale;

    setViewport({
      scale: nextScale,
      x: pointerX - originX * nextScale,
      y: pointerY - originY * nextScale,
    });
    setHasManualViewport(true);
  }, [viewport.scale, viewport.x, viewport.y]);

  return (
    <>
      <style>{`
        .image-engine-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(59, 130, 246, 0.52) transparent;
        }

        .image-engine-scroll::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        .image-engine-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .image-engine-scroll::-webkit-scrollbar-thumb {
          border-radius: 9999px;
          border: 3px solid transparent;
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.78), rgba(14, 165, 233, 0.34));
          background-clip: padding-box;
        }

        .image-engine-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(96, 165, 250, 0.92), rgba(34, 211, 238, 0.48));
          background-clip: padding-box;
        }

        .image-engine-scroll::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>

      <div className="fixed inset-0 z-40 h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_28%),linear-gradient(180deg,#020617_0%,#050b18_100%)] text-white">
      <div
        className="absolute inset-0"
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const files = Array.from(event.dataTransfer.files || []);
          if (!files.length) return;
          handleBaseFileSelection(files[0]);
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_40%)]" />

      <div className="absolute left-4 top-4 z-20 flex max-w-[min(1240px,calc(100vw-32px))] flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="pointer-events-auto h-11 rounded-2xl border-white/10 bg-slate-950/80 px-5 text-slate-100 hover:bg-slate-900/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <label className="pointer-events-auto inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(37,99,235,0.28)] hover:bg-blue-500">
          <Upload className="h-4 w-4" />
          {baseReference ? "Trocar base" : "Carregar base"}
          <input
            ref={baseInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(event) => {
              handleBaseFileSelection(event.target.files?.[0] || null);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <div className="pointer-events-auto relative">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsProjectsOpen((current) => !current)}
            disabled={projectsLoading}
            className="h-11 rounded-2xl border-white/10 bg-slate-950/80 px-4 text-slate-100 hover:bg-slate-900/80"
          >
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Projetos
            <span className="ml-3 max-w-[180px] truncate rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
              {projectsLoading ? "Carregando..." : currentProject.name}
            </span>
          </Button>

          {isProjectsOpen ? (
            <div className="absolute left-0 top-[calc(100%+12px)] z-30 flex max-h-[min(70vh,560px)] w-[min(360px,calc(100vw-32px))] flex-col rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,16,28,0.98)_0%,rgba(6,10,20,0.98)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-sm font-semibold text-white">Projetos</div>
                  <div className="text-[11px] text-slate-400">Cada projeto mantém canvas, base e conversa separados no servidor.</div>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  className="h-9 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Novo projeto
                </Button>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-gutter-stable">
                {projects.map((project) => {
                  const projectCanvasCount = project.snapshot.canvasItems.filter((item) => item.kind !== "pending").length;

                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleSelectProject(project.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all",
                        project.id === currentProjectId
                          ? "border-blue-400/35 bg-blue-500/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      )}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="truncate text-sm font-semibold text-white">{project.name}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {project.snapshot.baseReference ? "Com base carregada" : "Sem base"} • {projectCanvasCount} item{projectCanvasCount === 1 ? "" : "s"} no canvas
                        </div>
                      </div>
                      {project.id === currentProjectId ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-100">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
                          <LayoutTemplate className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 shadow-lg"
          style={{ maxWidth: Math.min(560, Math.max(280, viewportSize.width - 32)) }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status</div>
          <div className="mt-1 truncate text-sm font-medium text-slate-100">{statusText}</div>
        </div>
      </div>

      <div
        className="absolute top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-2 shadow-lg"
        style={{ right: 16 }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl bg-white/5 text-slate-200 hover:bg-white/10"
          onClick={() => {
            setViewport((current) => ({ ...current, scale: clamp(current.scale * 0.9, 0.08, 3) }));
            setHasManualViewport(true);
          }}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="min-w-[72px] text-center text-sm font-semibold text-slate-100">
          {Math.round(viewport.scale * 100)}%
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl bg-white/5 text-slate-200 hover:bg-white/10"
          onClick={() => {
            setViewport((current) => ({ ...current, scale: clamp(current.scale * 1.1, 0.08, 3) }));
            setHasManualViewport(true);
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          className="h-10 rounded-xl bg-white/5 px-4 text-slate-200 hover:bg-white/10"
          onClick={() => {
            fitCanvasToItems();
            setHasManualViewport(false);
          }}
        >
          Ajustar
        </Button>
        <Button
          variant="ghost"
          className="h-10 rounded-xl bg-white/5 px-4 text-slate-200 hover:bg-white/10"
          onClick={() => {
            setViewport({ scale: 0.42, x: 120, y: 96 });
            setHasManualViewport(true);
          }}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button
          variant="ghost"
          className="h-10 rounded-xl bg-white/5 px-4 text-slate-200 hover:bg-white/10"
          onClick={() => dockPanels()}
        >
          Reencaixar painéis
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100vw-32px)] flex-wrap gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-lg">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Canvas</div>
          <div className="mt-1 text-sm font-medium text-slate-100">
            {resultsCount} resultado{resultsCount === 1 ? "" : "s"} • {activeJobs.length} em andamento
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-lg">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Base ativa</div>
          <div className="mt-1 max-w-[320px] truncate text-sm font-medium text-slate-100">
            {baseReference?.file.name || "Nenhuma"}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-0"
        style={{
          paddingTop: canvasInsets.top,
          paddingRight: canvasInsets.right,
          paddingBottom: canvasInsets.bottom,
          paddingLeft: canvasInsets.left,
        }}
      >
      <div
        ref={canvasViewportRef}
        className="relative h-full w-full overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(0,0,0,0.22)]"
        onMouseDown={startCanvasPan}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
          }
        }}
        onWheel={handleCanvasWheel}
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.1),rgba(2,6,23,0.72))]" />

        {dragActive ? (
          <div className="pointer-events-none absolute inset-10 z-10 rounded-[32px] border-2 border-dashed border-blue-400/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]" />
        ) : null}

        {!baseReference ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 md:p-10">
            <div
              className="w-full max-w-[920px] rounded-[36px] border border-white/10 bg-slate-950/82 p-8 text-center shadow-[0_40px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-10"
              style={{ aspectRatio: previewAspectRatio, maxHeight: "min(72vh, 860px)" }}
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
                <ImageIcon className="h-8 w-8" />
              </div>
              <h1 className="mt-6 text-3xl font-bold text-white">Canvas de edição de imagem</h1>
              <p className="mt-3 text-base leading-relaxed text-slate-400">
                Carregue a imagem-base para abrir o canvas livre, pedir ajustes sucessivos e manter até {MAX_ACTIVE_JOBS} imagens processando/visíveis ao mesmo tempo.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                  className="h-12 rounded-2xl bg-blue-600 px-6 text-white hover:bg-blue-500"
                  onClick={() => baseInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Carregar base
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {canvasItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isPending = item.kind === "pending";
            const isBase = item.id === BASE_CANVAS_ITEM_ID;

            return (
              <div
                key={item.id}
                className="absolute"
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                }}
              >
                <div className="absolute -top-12 left-0 flex items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-slate-950/90 px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
                    {isBase ? "Base" : isPending ? "Preview" : "Resultado"}
                  </div>
                  <div className="rounded-full border border-white/10 bg-slate-950/90 px-3 py-1 text-[11px] text-slate-300 shadow-lg">
                    {formatResolutionLabel(item.naturalWidth, item.naturalHeight)}
                  </div>
                  {item.motor ? (
                    <div className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[11px] text-blue-200 shadow-lg">
                      {item.motor}
                    </div>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "group relative h-full w-full overflow-hidden rounded-[28px] border shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all",
                    isSelected ? "border-blue-400/80 ring-2 ring-blue-400/30" : "border-white/10 hover:border-white/20",
                    isBase ? "bg-slate-950/90" : "bg-black/40"
                  )}
                  onMouseDown={(event) => startCanvasItemDrag(event, item)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedItemId(item.id);
                  }}
                >
                  <img src={item.url} alt={item.title} className="h-full w-full select-none object-contain" draggable={false} />

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
                    <div className="max-w-[70%] rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
                      <div className="truncate text-sm font-semibold text-white">{item.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-300">
                        {item.subtitle || item.status || "Pronto"}
                      </div>
                    </div>

                    <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {!isBase ? (
                        <button
                          type="button"
                          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/55 text-slate-200 backdrop-blur-md hover:bg-black/70"
                          onClick={async (event) => {
                            event.stopPropagation();
                            await useCanvasItemAsBase(item);
                          }}
                        >
                          <Wand2 className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/55 text-slate-200 backdrop-blur-md hover:bg-black/70"
                        onClick={async (event) => {
                          event.stopPropagation();
                          await downloadImage(item.url, `${item.title.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {!isBase ? (
                        <button
                          type="button"
                          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/55 text-rose-200 backdrop-blur-md hover:bg-rose-500/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeCanvasItem(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isPending ? (
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.56)_100%)]">
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <div className="overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all"
                            style={{ width: `${item.progress ?? 0}%` }}
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-slate-100">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {item.status || "Processando..."}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

      <FloatingPanel
        title="IA Assistente"
        subtitle={`${activeJobs.length}/${MAX_ACTIVE_JOBS} processando`}
        position={assistantPanelPosition}
        setPosition={setAssistantPanelPosition}
        size={effectiveAssistantPanelSize}
        setSize={setAssistantPanelSize}
        minWidth={400}
        minHeight={520}
        maxWidth={460}
        maxHeight={viewportSize.height - 16}
        bodyClassName="overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Assistente multimodal</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  A base original fica preservada no canvas. O editor permanece livre para você mover, comparar e gerar novas variações sem perder a primeira imagem.
                </div>
              </div>
            </div>

            <div className="mt-4 flex shrink-0 flex-wrap gap-2">
              {baseReference ? (
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                  Base pronta
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                  <ScanSearch className="h-3.5 w-3.5" />
                  Base pendente
                </div>
              )}
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {currentFormatBadgeLabel} • {currentQuality.shortLabel}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {resolutionMode === "custom" && hasValidCustomDimensions
                  ? `${parsedCustomWidth}×${parsedCustomHeight}`
                  : "Resolução preservada"}
              </div>
            </div>
          </div>

          <div
            ref={chatViewportRef}
            className="image-engine-scroll mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[24px] border border-white/10 bg-slate-950/40 p-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" ? (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-indigo-300 ring-1 ring-white/10">
                    <Bot className="h-4 w-4" />
                  </div>
                ) : null}

                <div
                  className={cn(
                    "max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-relaxed shadow-lg",
                    message.role === "user"
                      ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
                      : message.tone === "success"
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                      : message.tone === "warning"
                      ? "border border-amber-500/20 bg-amber-500/10 text-amber-100"
                      : "border border-white/10 bg-white/5 text-slate-200"
                  )}
                >
                  <div>{message.content}</div>

                  {message.attachments?.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {message.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                        >
                          <img src={attachment.previewUrl} alt={attachment.name} className="h-20 w-full object-cover" />
                          <div className="p-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                              {attachment.label}
                            </div>
                            <div className="truncate text-[11px] text-slate-200">{attachment.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 shrink-0 rounded-[24px] border border-white/10 bg-slate-950/60 p-3 shadow-inner">
            <Textarea
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              className="min-h-[110px] resize-none border-0 bg-transparent px-2 py-2 text-sm text-white placeholder:text-slate-600 focus-visible:ring-0"
              placeholder="Descreva exatamente o que deve mudar, o que deve ser preservado e o resultado esperado."
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="h-10 rounded-xl bg-white/5 px-4 text-slate-200 hover:bg-white/10"
                  onClick={() => baseInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Base
                </Button>
              </div>

              <Button
                className="h-10 rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-500"
                onClick={() => handleGenerate()}
                disabled={!baseReference || !promptInput.trim() || activeJobs.length >= MAX_ACTIVE_JOBS}
              >
                {activeJobs.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                Enviar pedido
              </Button>
            </div>
          </div>
        </div>
      </FloatingPanel>
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3">
        {isSettingsOpen ? (
          <div className="image-engine-scroll w-[min(460px,calc(100vw-24px))] max-h-[min(76vh,720px)] overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,16,28,0.98)_0%,rgba(6,10,20,0.98)_100%)] shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[linear-gradient(180deg,rgba(9,16,28,0.98)_0%,rgba(6,10,20,0.98)_100%)] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">Formato, dimensões e qualidade</div>
                <div className="truncate text-[11px] text-slate-400">Painel fixo do processamento</div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Settings2 className="h-4 w-4 text-indigo-300" />
                  Formato e tamanho
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setResolutionMode("preset")}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-all",
                      resolutionMode === "preset" ? "bg-slate-100 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                    )}
                  >
                    Presets sociais
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionMode("custom")}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-all",
                      resolutionMode === "custom" ? "bg-slate-100 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                    )}
                  >
                    Tamanho exato
                  </button>
                </div>

                {resolutionMode === "preset" ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {FORMAT_OPTIONS.map((option) => {
                      const active = formato === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormato(option.value)}
                          className={cn(
                            "rounded-[22px] border px-4 py-4 text-left transition-all",
                            active
                              ? "border-blue-400/40 bg-blue-500/10"
                              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                          )}
                        >
                          <div className="flex min-h-[72px] flex-col justify-between gap-4">
                            <div
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-2xl",
                                active ? "bg-blue-500/20 text-blue-200" : "bg-white/5 text-slate-300"
                              )}
                            >
                              {option.icon}
                            </div>
                            <div className="text-sm font-semibold leading-snug text-white">{option.label}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Largura</div>
                        <Input
                          type="number"
                          value={customWidth}
                          onChange={(event) => setCustomWidth(event.target.value)}
                          className="border-white/10 bg-slate-950/60 text-white"
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Altura</div>
                        <Input
                          type="number"
                          value={customHeight}
                          onChange={(event) => setCustomHeight(event.target.value)}
                          className="border-white/10 bg-slate-950/60 text-white"
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                      No tamanho exato, a proporção vem da resolução informada. Os presets 1:1, 9:16 e 16:9 ficam desativados para evitar conflito no resultado.
                    </div>
                    <div className="text-xs text-slate-400">
                      Faixa aceita pelo backend: 256 a 4096 pixels. Quando a resolução estiver válida, o tamanho customizado é enviado ao backend mesmo sem crop.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-white">Qualidade do processamento</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {QUALITY_OPTIONS.map((option) => {
                    const active = qualidade === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setQualidade(option.value)}
                        className={cn(
                          "rounded-[22px] border px-4 py-4 text-left transition-all",
                          active
                            ? "border-emerald-400/35 bg-emerald-500/10"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        )}
                      >
                        <div className="flex min-h-[72px] flex-col justify-between gap-4">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-2xl",
                              active ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-slate-300"
                            )}
                          >
                            {option.icon}
                          </div>
                          <div className="text-sm font-semibold leading-snug text-white">{option.label}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white">Automação do fluxo</div>
                  <div className="mt-4 space-y-3">
                    {[
                      {
                        label: "Preservar enquadramento original",
                        description: "Mantém todo o conteúdo já visível da base. Se a proporção mudar, o sistema tenta expandir o canvas com IA antes de recorrer a fallback sem crop.",
                        value: preserveOriginalFrame,
                        setValue: setPreserveOriginalFrame,
                      },
                      {
                        label: "Permitir crop para preencher 100%",
                        description: "Quando ligado, o arquivo final pode cortar as sobras para ocupar todo o width/height. Quando desligado, o sistema mantém o tamanho exato sem distorcer e sem crop agressivo.",
                        value: allowResizeCrop,
                        setValue: setAllowResizeCrop,
                      },
                    ].map((toggle) => (
                      <button
                        key={toggle.label}
                        type="button"
                        onClick={() => toggle.setValue((current: boolean) => !current)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all",
                          toggle.value ? "border-blue-400/25 bg-blue-500/10" : "border-white/10 bg-slate-950/50 hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="pr-4">
                          <div className="text-sm text-white">{toggle.label}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-400">{toggle.description}</div>
                        </div>
                        <div
                          className={cn(
                            "flex h-7 w-12 items-center rounded-full p-1 transition-all",
                            toggle.value ? "bg-blue-500" : "bg-slate-700"
                          )}
                        >
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full bg-white transition-all",
                              toggle.value ? "translate-x-5" : "translate-x-0"
                            )}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white">Resumo operacional</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>{resolutionMode === "custom" && hasValidCustomDimensions ? "Tamanho" : "Formato"}</span>
                      <span className="font-semibold text-white">{currentFormatBadgeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>Qualidade</span>
                      <span className="font-semibold text-white">{currentQuality.shortLabel}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>Base ativa</span>
                      <span className="max-w-[180px] truncate text-right font-semibold text-white">
                        {baseReference?.file.name || "Nenhuma"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>Base original</span>
                      <span className="font-semibold text-white">Preservada</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>Resize final</span>
                      <span className="font-semibold text-white">{currentResizeBehaviorLabel}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-4 py-3">
                      <span>Canvas</span>
                      <span className="font-semibold text-white">
                        {resultsCount} pronto{resultsCount === 1 ? "" : "s"} / {activeJobs.length} em andamento
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setIsSettingsOpen((current) => !current)}
          className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-medium text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:bg-slate-900"
        >
          <Settings2 className="h-4 w-4 text-indigo-300" />
          {isSettingsOpen ? "Ocultar controles" : "Formato, dimensões e qualidade"}
        </button>
      </div>
      </div>
    </>
  );
}
