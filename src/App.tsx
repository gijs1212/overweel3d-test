import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import NewOrder from "./pages/NewOrder";
import Voorwaarden from "./pages/Voorwaarden";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import Opdrachten from "./pages/Opdrachten";
import AuthCallback from "./pages/AuthCallback";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import OrderDetail from "./pages/OrderDetail";
import AdminDashboard from "./pages/AdminDashboard";
import AdminOrderEdit from "./pages/AdminOrderEdit";
import AdminNewOrder from "./pages/AdminNewOrder";
import AdminBlog from "./pages/AdminBlog";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AdminContentMarketing from "./pages/AdminContentMarketing";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/bestellen" element={<NewOrder />} />
            <Route path="/voorwaarden" element={<Voorwaarden />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/opdrachten" element={<Opdrachten />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profiel" element={<Profile />} />
            <Route path="/order/:token" element={<OrderDetail />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/order/:orderId" element={<AdminOrderEdit />} />
            <Route path="/admin/new-order" element={<AdminNewOrder />} />
            <Route path="/admin/blog" element={<AdminBlog />} />
            <Route path="/admin/content" element={<AdminContentMarketing />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
