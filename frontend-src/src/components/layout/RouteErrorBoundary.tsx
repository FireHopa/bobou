import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RouteErrorBoundary() {
  const err = useRouteError();

  let title = "Algo quebrou";
  let detail = "Ocorreu um erro inesperado.";

  if (isRouteErrorResponse(err)) {
    title = `Erro ${err.status}`;
    detail = err.data?.detail ?? err.statusText;
  } else if (err instanceof Error) {
    detail = err.message;
  }

  return (
    <div className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{detail}</p>
          <Button onClick={() => window.location.assign("/")}>Voltar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
