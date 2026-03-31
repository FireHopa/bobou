import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Página não encontrada.</p>
          <Button onClick={() => window.location.assign("/")}>Ir para início</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default NotFoundPage;
