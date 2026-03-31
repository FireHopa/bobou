import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>{hasQuery ? "Nada encontrado." : "Nenhum robô ainda."}</CardTitle>
        <CardDescription>
          {hasQuery
            ? "Tente ajustar a busca ou filtros."
            : "Comece sua jornada e crie o primeiro robô de autoridade."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="accent">
          <Link to="/journey">Começar Jornada</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Voltar</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
