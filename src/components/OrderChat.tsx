import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  sender_type: string;
  message: string;
  created_at: string;
  read: boolean;
}

interface OrderChatProps {
  orderId: string;
  senderType: "customer" | "admin";
  orderNumber?: string;
}

export function OrderChat({ orderId, senderType, orderNumber }: OrderChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("order_messages")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
  }, [orderId]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("order_messages").insert({
        order_id: orderId,
        sender_type: senderType,
        sender_id: user?.id || null,
        message: newMessage.trim(),
      });
      if (error) throw error;

      // Send email notification
      try {
        await supabase.functions.invoke("send-chat-notification", {
          body: { orderId, message: newMessage.trim(), senderType },
        });
      } catch (e) {
        console.error("Chat notification failed:", e);
      }

      setNewMessage("");
      fetchMessages();
    } catch (error: any) {
      toast({ title: "Bericht verzenden mislukt", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
      <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-accent" />
        Berichten {orderNumber && `— ${orderNumber}`}
      </h3>

      <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nog geen berichten.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_type === senderType ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.sender_type === senderType
                    ? "bg-accent text-accent-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p className={`text-[10px] mt-1 ${msg.sender_type === senderType ? "text-accent-foreground/60" : "text-muted-foreground"}`}>
                  {msg.sender_type === "admin" ? "Overweel3D" : "Klant"} · {new Date(msg.created_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Typ een bericht..."
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="sm" className="self-end">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
