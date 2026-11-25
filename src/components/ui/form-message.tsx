import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {messages[0]}
    </p>
  );
}

export function FormStatus({ error, success }: { error?: string; success?: string }) {
  if (error)
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (success)
    return (
      <Alert variant="info">
        <CheckCircle2 />
        <AlertDescription>{success}</AlertDescription>
      </Alert>
    );
  return null;
}
