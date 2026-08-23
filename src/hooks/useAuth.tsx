import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/functionErrors";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  billing_address: string;
  shipping_address: string;
  postal_code: string;
  city: string;
  country: string;
  vat_number: string;
  newsletter_subscribed: boolean;
  account_welcome_email_sent_at: string | null;
  loyalty_points: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  setNewsletterPreference: (active: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data as Profile);
  };

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setLoading(true);
          setTimeout(async () => {
            await Promise.all([
              fetchProfile(session.user.id),
              checkAdmin(session.user.id),
            ]);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchProfile(session.user.id),
          checkAdmin(session.user.id),
        ]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;

    // Supabase can return an obfuscated user for an existing e-mail address.
    // Only a response with a newly-created identity may request the welcome mail.
    if (data.user?.id && (data.user.identities?.length ?? 0) > 0) {
      const { error: welcomeError } = await supabase.functions.invoke("send-account-welcome", {
        body: { userId: data.user.id },
      });
      if (welcomeError) {
        console.warn("Account welcome email could not be sent:", welcomeError.message);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!user) throw new Error("Not authenticated");
    const { error } = await supabase
      .from("profiles")
      .update(data)
      .eq("user_id", user.id);
    if (error) throw error;
    await fetchProfile(user.id);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const setNewsletterPreference = async (active: boolean) => {
    if (!user) throw new Error("Log in om uw nieuwsbriefvoorkeur te wijzigen.");
    const { data, error } = await supabase.functions.invoke("manage-newsletter", {
      body: { action: "set_preference", active },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error, "De nieuwsbriefvoorkeur kon niet worden opgeslagen."));
    if (!data?.success) throw new Error(data?.error || "De nieuwsbriefvoorkeur kon niet worden opgeslagen.");
    await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, isAdmin, loading,
        signUp, signIn, signOut, resetPassword, updatePassword,
        updateProfile, setNewsletterPreference, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
