import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import type { DeliveryStatus } from "../domain/mailer";

export function DeliveryIcon({ status }: { status: DeliveryStatus }) {
  if (status === "sent") return <CheckCircle2 className="shrink-0 text-emerald-500" size={15} />;
  if (status === "failed") return <AlertCircle className="shrink-0 text-rose-500" size={15} />;
  if (status === "sending") return <LoaderCircle className="shrink-0 animate-spin text-indigo-500" size={15} />;
  return <Clock3 className="shrink-0 text-slate-300" size={15} />;
}

