import { useId, useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  isValidNewsletterEmail,
  subscribeToNewsletter,
  type NewsletterSignupSource,
} from "@/lib/newsletter";
import { cn } from "@/lib/utils";

interface NewsletterSignupFormProps {
  source: NewsletterSignupSource;
  className?: string;
  inputClassName?: string;
  buttonLabel?: string;
  onSubscribed?: () => void;
}

export function NewsletterSignupForm({
  source,
  className,
  inputClassName,
  buttonLabel = "Aanmelden",
  onSubscribed,
}: NewsletterSignupFormProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isValidNewsletterEmail(email)) {
      setErrorMessage("Vul een geldig e-mailadres in.");
      return;
    }

    setIsSubmitting(true);

    try {
      await subscribeToNewsletter(email, source);
      setEmail("");
      toast({
        title: "U bent aangemeld!",
        description: "U ontvangt voortaan het nieuws van Overweel3D.",
      });
      onSubscribed?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Aanmelden is niet gelukt.";
      setErrorMessage(message);
      toast({
        title: "Aanmelden mislukt",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={cn("space-y-2", className)} noValidate onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        E-mailadres voor de nieuwsbrief
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={errorMessage ? true : undefined}
            autoComplete="email"
            className={inputClassName}
            disabled={isSubmitting}
            id={inputId}
            inputMode="email"
            maxLength={254}
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              if (errorMessage) setErrorMessage("");
            }}
            placeholder="uw@email.nl"
            type="email"
            value={email}
          />
        </div>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Mail aria-hidden="true" className="h-4 w-4" />}
          {isSubmitting ? "Aanmelden..." : buttonLabel}
        </Button>
      </div>
      {errorMessage && (
        <p className="text-sm text-destructive" id={errorId} role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
