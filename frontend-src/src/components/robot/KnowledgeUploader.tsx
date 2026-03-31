import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle2, Trash2, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  uploadRobotKnowledgeFile, 
  uploadBusinessCoreKnowledgeFile,
  deleteRobotKnowledgeFile,
  deleteBusinessCoreKnowledgeFile
} from "@/services/robots";

interface KnowledgeUploaderProps {
  publicId: string;
  type: "robot" | "business-core";
  existingFilesJson?: string | null;
  onUploadSuccess?: () => void;
}

export function KnowledgeUploader({ publicId, type, existingFilesJson, onUploadSuccess }: KnowledgeUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadedFiles: Array<{ filename: string; uploaded_at: string }> = 
    existingFilesJson ? JSON.parse(existingFilesJson) : [];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ["pdf", "docx", "txt", "md", "csv"];
    const ext = file.name.split('.').pop()?.toLowerCase() || "";
    
    if (!validExtensions.includes(ext)) {
      toast.error("Formato inválido. Use PDF, DOCX, TXT, MD ou CSV.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo é muito grande. O limite é de 5MB.");
      return;
    }

    try {
      setIsUploading(true);
      if (type === "robot") {
        await uploadRobotKnowledgeFile(publicId, file);
      } else {
        await uploadBusinessCoreKnowledgeFile(publicId, file);
      }
      toast.success(`Arquivo ${file.name} processado e aprendido com sucesso!`);
      if (onUploadSuccess) onUploadSuccess();
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar arquivo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      setDeletingFile(filename);
      if (type === "robot") {
        await deleteRobotKnowledgeFile(publicId, filename);
      } else {
        await deleteBusinessCoreKnowledgeFile(publicId, filename);
      }
      toast.success("Arquivo removido do cérebro com sucesso!");
      if (onUploadSuccess) onUploadSuccess();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir arquivo.");
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <Card className="border-border/60 bg-background/50 backdrop-blur-sm shadow-sm flex flex-col h-fit overflow-hidden transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-5 border-b border-border/30 bg-muted/10">
        <CardTitle className="text-lg font-bold flex items-center gap-3">
          <div className="p-2 bg-google-blue/10 rounded-xl">
            <FileText className="w-5 h-5 text-google-blue" />
          </div>
          Base de Conhecimento
        </CardTitle>
        <CardDescription className="text-sm mt-2 leading-relaxed">
          Faça upload de materiais para treinar a inteligência. O conteúdo será absorvido pelos agentes.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-5 flex flex-col gap-6">
        {/* Área de Upload Estilo Dropzone */}
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.docx,.txt,.md,.csv"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || deletingFile !== null}
            className={cn(
              "w-full relative group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 p-8 text-center transition-all duration-200",
              "hover:bg-google-blue/5 hover:border-google-blue/40 hover:shadow-sm cursor-pointer",
              "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-muted/20 disabled:hover:border-border/60"
            )}
          >
            <div className="p-4 bg-background shadow-sm rounded-full group-hover:scale-105 transition-transform duration-200">
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-google-blue animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground group-hover:text-google-blue transition-colors" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isUploading ? "Lendo documento..." : "Clique para anexar arquivo"}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                PDF, DOCX, TXT ou CSV (Max. 5MB)
              </p>
            </div>
          </button>
        </div>

        {/* Lista de Arquivos */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between pb-2 border-b border-border/40">
              Arquivos Aprendidos
              <Badge variant="secondary" className="bg-google-blue/10 text-google-blue hover:bg-google-blue/20">
                {uploadedFiles.length}
              </Badge>
            </h4>
            
            <div className="grid gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-sm bg-background/80 p-3.5 rounded-xl border border-border/50 group min-w-0 transition-all hover:border-google-blue/30 hover:shadow-sm">
                  <div className="p-1.5 bg-[#00D278]/10 rounded-lg shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#00D278]" />
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground truncate" title={f.filename}>
                      {f.filename}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate font-medium">
                      {new Date(f.uploaded_at).toLocaleDateString()} às {new Date(f.uploaded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                    disabled={deletingFile === f.filename}
                    onClick={() => handleDelete(f.filename)}
                    title="Remover arquivo"
                  >
                    {deletingFile === f.filename ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}