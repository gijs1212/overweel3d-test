import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { StoredThreeMfViewerDialog } from "@/components/StoredThreeMfViewerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { findPlateRequestPrinter, isVisiblePlateRequest } from "@/lib/plateRequests";

type PrinterRow = Database["public"]["Tables"]["printers"]["Row"];
type JobRow = Database["public"]["Tables"]["print_jobs"]["Row"];
type OrderRow = Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "order_number" | "customer_name" | "status" | "total_plates">;

export function PlateApprovalRequests() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [manualPlates, setManualPlates] = useState<Record<string, string>>({});
  const [confirmJob, setConfirmJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewerJob, setViewerJob] = useState<JobRow | null>(null);

  const load = useCallback(async () => {
    const [jobResult, orderResult, printerResult] = await Promise.all([
      supabase.from("print_jobs").select("*").order("suggested_at", { ascending: true, nullsFirst: false }),
      supabase.from("orders").select("id,order_number,customer_name,status,total_plates"),
      supabase.from("printers").select("*"),
    ]);
    const error = jobResult.error || orderResult.error || printerResult.error;
    if (error) {
      toast({ title: "Plaatverzoeken laden mislukt", description: error.message, variant: "destructive" });
    } else {
      setJobs(jobResult.data || []);
      setOrders(orderResult.data || []);
      setPrinters(printerResult.data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const channel = supabase.channel("admin-dashboard-plate-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "printers" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .subscribe();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [isAdmin, load]);

  const requests = useMemo(
    () => jobs.filter((job) => isVisiblePlateRequest(job, orders, printers)),
    [jobs, orders, printers],
  );

  const selectedPlate = (job: JobRow) => {
    const printerPlate = findPlateRequestPrinter(job, printers)?.current_plate;
    if (printerPlate != null) return printerPlate;
    const entered = Number(manualPlates[job.id]);
    return Number.isInteger(entered) && entered > 0 ? entered : null;
  };

  const approve = async (request: JobRow) => {
    const order = orders.find((item) => item.id === request.order_id);
    const printer = findPlateRequestPrinter(request, printers);
    const plate = selectedPlate(request);
    const maximum = Math.max(1, order?.total_plates || 1);
    if (!order || !printer || plate == null || plate > maximum) {
      toast({ title: "Vul een geldig plaatnummer in", description: `Kies voor dit verzoek een plaat tussen 1 en ${maximum}.`, variant: "destructive" });
      return;
    }
    if (!isVisiblePlateRequest(request, orders, printers)) {
      toast({ title: "Verzoek is niet meer actueel", description: "Het actieve printerbestand komt niet meer overeen.", variant: "destructive" });
      setConfirmJob(null);
      await load();
      return;
    }
    const target = jobs.find((job) => job.order_id === request.order_id && job.plate_number === plate && !["completed", "cancelled"].includes(job.status));
    if (!target) {
      toast({ title: "Plaatkoppeling ontbreekt", description: `Plaat ${plate} staat niet in de 3MF-koppelingen van deze bestelling.`, variant: "destructive" });
      return;
    }
    if (printer.current_plate != null && printer.current_plate !== target.plate_number) {
      toast({ title: "Andere plaat actief", description: `De printer meldt plaat ${printer.current_plate}.`, variant: "destructive" });
      return;
    }

    setSavingId(request.id);
    if (request.status !== "suggested" || request.printer_id !== printer.id) {
      const { error: restoreError } = await supabase.from("print_jobs").update({ status: "suggested", printer_id: printer.id }).eq("id", request.id).in("status", ["suggested", "approved", "printing", "paused"]);
      if (restoreError) {
        setSavingId(null);
        toast({ title: "Oud plaatverzoek herstellen mislukt", description: restoreError.message, variant: "destructive" });
        return;
      }
    }
    const { data, error } = await supabase.rpc("approve_and_count_print_job_run", {
      p_suggestion_job_id: request.id,
      p_plate_number: plate,
    });
    setSavingId(null);
    setConfirmJob(null);
    const result = data as { counted?: boolean; completed?: boolean; remainingRuns?: number; runNumber?: number; runsRequired?: number; reason?: string } | null;
    if (error || !result?.counted) {
      toast({ title: "Goedkeuren mislukt", description: error?.message || `De printrun kon niet worden geteld (${result?.reason || "onbekende reden"}).`, variant: "destructive" });
      return;
    }
    setManualPlates((current) => { const next = { ...current }; delete next[request.id]; return next; });
    toast({
      title: result.completed ? "Plaat volledig geprint" : "Printrun geteld",
      description: result.completed
        ? `${order.order_number} · plaat ${plate} is volledig geprint.`
        : `${order.order_number} · plaat ${plate}: run ${result.runNumber} van ${result.runsRequired} is geteld; nog ${result.remainingRuns} te printen.`,
    });
    await load();
  };

  if (!isAdmin || loading || requests.length === 0) return null;

  return (
    <section className="bg-card border-2 border-accent rounded-2xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-accent" /> Plaatverzoeken ({requests.length})</h2>
          <p className="text-sm text-muted-foreground">Controleer alle actieve matches. Ieder onbekend plaatnummer kan afzonderlijk worden ingevuld.</p>
        </div>
        <Button variant="outline" asChild><Link to="/admin/production">Open printproductie <ExternalLink className="w-4 h-4" /></Link></Button>
      </div>
      <div className="space-y-3">
        {requests.map((job) => {
          const order = orders.find((item) => item.id === job.order_id);
          const printer = findPlateRequestPrinter(job, printers);
          const plateKnown = printer?.current_plate != null;
          const plate = selectedPlate(job);
          const maximum = Math.max(1, order?.total_plates || 1);
          const valid = plate != null && plate <= maximum;
          return (
            <article key={job.id} className="rounded-xl border bg-background p-4 grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <div className="min-w-0">
                <h3 className="font-bold">{order?.order_number || "Bestelling"} · {order?.customer_name || "Klant"}</h3>
                <p className="text-sm text-muted-foreground truncate">{printer?.name || "Printer"}: {printer?.current_file}</p>
                <p className="text-xs text-accent mt-1">Match met {job.expected_file_name}</p>
              </div>
              <div>
                <Label htmlFor={`dashboard-plate-${job.id}`}>{plateKnown ? "Plaat volgens printer" : "Plaatnummer invullen"}</Label>
                <Input id={`dashboard-plate-${job.id}`} type="number" min={1} max={maximum} value={plateKnown ? printer.current_plate ?? "" : manualPlates[job.id] || ""} disabled={plateKnown} onChange={(event) => setManualPlates((current) => ({ ...current, [job.id]: event.target.value }))} placeholder={`1 t/m ${maximum}`} />
              </div>
              <div className="flex flex-wrap gap-2">
                {job.three_mf_storage_path && <Button type="button" variant="outline" onClick={() => setViewerJob(job)}><Eye className="w-4 h-4" /> 3MF-viewer</Button>}
                <Button onClick={() => setConfirmJob(job)} disabled={!valid || savingId === job.id}>{savingId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Goedkeuren</Button>
              </div>
            </article>
          );
        })}
      </div>
      <ConfirmActionDialog
        open={confirmJob !== null}
        onOpenChange={(open) => !open && setConfirmJob(null)}
        title="Bestelling en plaat goedkeuren?"
        description={confirmJob ? `${orders.find((order) => order.id === confirmJob.order_id)?.order_number || "Bestelling"} · ${orders.find((order) => order.id === confirmJob.order_id)?.customer_name || "Klant"} · plaat ${selectedPlate(confirmJob) ?? "onbekend"}. Met deze goedkeuring wordt direct één printuitvoering afgetrokken van het resterende aantal.` : ""}
        confirmLabel="Goedkeuren en printrun tellen"
        onConfirm={() => confirmJob ? approve(confirmJob) : undefined}
      />
      <StoredThreeMfViewerDialog open={viewerJob !== null} onOpenChange={(open) => !open && setViewerJob(null)} storagePath={viewerJob?.three_mf_storage_path} filename={viewerJob?.expected_file_name} />
    </section>
  );
}
