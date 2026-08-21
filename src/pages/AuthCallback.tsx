import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  extractCallbackParams,
  validateState,
  getCodeVerifier,
  clearPkceSession,
} from "@/lib/pkce";

type Status = "processing" | "success" | "error";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState("Token exchange wordt verwerkt...");

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    const { code, state, error, errorDescription } = extractCallbackParams();

    if (error) {
      setStatus("error");
      setMessage(`Microsoft fout: ${error} — ${errorDescription || "Onbekende fout"}`);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Geen authorization code of state ontvangen.");
      return;
    }

    if (!validateState(state)) {
      setStatus("error");
      setMessage("State mismatch — mogelijke CSRF aanval. Probeer opnieuw.");
      return;
    }

    const codeVerifier = getCodeVerifier();
    if (!codeVerifier) {
      setStatus("error");
      setMessage("Code verifier niet gevonden. Start de authenticatie opnieuw.");
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "exchange-onedrive-token",
        {
          body: { code, codeVerifier },
        }
      );

      clearPkceSession();

      if (fnError) {
        throw new Error(fnError.message || "Token exchange mislukt");
      }

      if (data?.success) {
        setStatus("success");
        setMessage("OneDrive is succesvol gekoppeld! Je kunt dit venster sluiten.");
      } else {
        throw new Error(data?.error || "Onverwachte fout bij token exchange");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Er ging iets mis bij de token exchange.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 text-center space-y-6">
        {status === "processing" && (
          <>
            <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin" />
            <h1 className="text-2xl font-bold text-foreground">Even geduld...</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <h1 className="text-2xl font-bold text-foreground">Gelukt!</h1>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 mx-auto text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">Fout</h1>
          </>
        )}
        <p className="text-muted-foreground">{message}</p>
        {status !== "processing" && (
          <button
            onClick={() => navigate("/")}
            className="text-primary underline hover:no-underline text-foreground"
          >
            Terug naar home
          </button>
        )}
      </div>
    </div>
  );
}
