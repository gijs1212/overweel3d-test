import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Appointment {
  id: string;
  proposed_date: string;
  proposed_time_slot: string;
  status: string;
  proposed_by: string;
  customer_notes: string;
  admin_notes: string;
  created_at: string;
}

interface DeliverySchedulerProps {
  orderId: string;
  appointments: Appointment[];
  isAdmin?: boolean;
  onUpdate: () => void | Promise<void>;
}

export function DeliveryScheduler({ orderId, appointments, isAdmin = false, onUpdate }: DeliverySchedulerProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appointmentActionId, setAppointmentActionId] = useState<string | null>(null);

  const handlePropose = async () => {
    if (!date) {
      toast({ title: "Kies een datum", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("delivery_appointments").insert({
        order_id: orderId,
        proposed_date: date,
        proposed_time_slot: timeSlot || "Overdag",
        proposed_by: isAdmin ? "admin" : "customer",
        customer_notes: isAdmin ? "" : notes,
        admin_notes: isAdmin ? notes : "",
      });
      if (error) throw error;
      toast({ title: "Voorstel ingediend! ✅" });
      setShowForm(false);
      setDate("");
      setTimeSlot("");
      setNotes("");
      await onUpdate();
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : "Het voorstel kon niet worden opgeslagen.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (appointmentId: string) => {
    setAppointmentActionId(appointmentId);
    try {
      const { data, error } = await supabase
        .from("delivery_appointments")
        .update({ status: "confirmed", admin_notes: "Bevestigd door admin" })
        .eq("id", appointmentId)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("De afspraak bestaat niet meer.");
      toast({ title: "Afspraak bevestigd! ✅" });
      await onUpdate();
    } catch (error: unknown) {
      toast({ title: "Bevestigen mislukt", description: error instanceof Error ? error.message : "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setAppointmentActionId(null);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    setAppointmentActionId(appointmentId);
    try {
      const { data, error } = await supabase
        .from("delivery_appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("De afspraak bestaat niet meer.");
      toast({ title: "Afspraak geannuleerd" });
      await onUpdate();
    } catch (error: unknown) {
      toast({ title: "Annuleren mislukt", description: error instanceof Error ? error.message : "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setAppointmentActionId(null);
    }
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const statusLabels: Record<string, string> = {
    pending: "In afwachting",
    confirmed: "Bevestigd",
    cancelled: "Geannuleerd",
  };

  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
      <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-accent" />
        Bezorgafspraken
      </h3>

      {appointments.length > 0 && (
        <div className="space-y-3 mb-4">
          {appointments.map((apt) => (
            <div key={apt.id} className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {new Date(apt.proposed_date).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
                    {apt.proposed_time_slot && ` — ${apt.proposed_time_slot}`}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[apt.status]}`}>
                  {statusLabels[apt.status]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Voorgesteld door {apt.proposed_by === "admin" ? "Overweel3D" : "klant"}
              </p>
              {apt.customer_notes && <p className="text-sm mt-1">Klant: {apt.customer_notes}</p>}
              {apt.admin_notes && <p className="text-sm mt-1">Overweel3D: {apt.admin_notes}</p>}
              
              {isAdmin && apt.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => void handleConfirm(apt.id)} className="text-green-600" disabled={appointmentActionId === apt.id}>
                    {appointmentActionId === apt.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Bevestigen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleCancel(apt.id)} className="text-destructive" disabled={appointmentActionId === apt.id}>
                    <X className="w-3 h-3" /> Annuleren
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <Label>Datum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
          </div>
          <div>
            <Label>Tijdvak (optioneel)</Label>
            <Input value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} placeholder="bijv. 's ochtends, 14:00-16:00" />
          </div>
          <div>
            <Label>Opmerking (optioneel)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Extra info over de bezorging..." />
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePropose} disabled={submitting} size="sm">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Voorstel indienen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Annuleren</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Calendar className="w-4 h-4" /> {isAdmin ? "Bezorgmoment voorstellen" : "Bezorgmoment kiezen"}
        </Button>
      )}
    </div>
  );
}
