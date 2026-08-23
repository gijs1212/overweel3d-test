import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AdminFilamentInventory } from "@/components/AdminFilamentInventory";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function AdminFilamentInventoryPage() {
  const { isAdmin, loading } = useAuth();
  return <div className="min-h-screen"><Navbar /><main className="min-h-[70vh] bg-neutral-100 pb-16 pt-24"><div className="container mx-auto max-w-6xl px-4 py-8">
    {loading ? <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div> : !isAdmin ? <div className="rounded-2xl bg-white p-10 text-center"><h1 className="text-2xl font-bold">Geen toegang</h1><p className="mt-2 text-black/50">Dit onderdeel is alleen voor administrators.</p></div> : <>
      <Button asChild variant="ghost" className="mb-5"><Link to="/admin"><ArrowLeft className="h-4 w-4" /> Terug naar dashboard</Link></Button>
      <AdminFilamentInventory />
    </>}
  </div></main><Footer /></div>;
}
