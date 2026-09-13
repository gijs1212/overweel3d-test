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
import AdminProducts from "./pages/AdminProducts";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AdminContentMarketing from "./pages/AdminContentMarketing";
import AdminDiscountCodes from "./pages/AdminDiscountCodes";
import AdminColors from "./pages/AdminColors";
import AdminMaterials from "./pages/AdminMaterials";
import AdminNewsletter from "./pages/AdminNewsletter";
import AdminCustomers from "./pages/AdminCustomers";
import AdminProduction from "./pages/AdminProduction";
import AdminReports from "./pages/AdminReports";
import AdminReviews from "./pages/AdminReviews";
import AdminGiftCards from "./pages/AdminGiftCards";
import AdminFilamentInventoryPage from "./pages/AdminFilamentInventoryPage";
import AdminPriceCalculatorPage from "./pages/AdminPriceCalculatorPage";
import AdminOrderFiles from "./pages/AdminOrderFiles";
import AdminAssignments from "./pages/AdminAssignments";
import Kleuren from "./pages/Kleuren";
import NotFound from "./pages/NotFound";
import CookieBanner from "./components/CookieBanner";
import NewsletterPopup from "./components/NewsletterPopup";
import UploadProgressCenter from "./components/UploadProgressCenter";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/content" element={<AdminContentMarketing />} />
            <Route path="/admin/discounts" element={<AdminDiscountCodes />} />
            <Route path="/admin/colors" element={<AdminColors />} />
            <Route path="/admin/materials" element={<AdminMaterials />} />
            <Route path="/admin/newsletter" element={<AdminNewsletter />} />
            <Route path="/admin/customers" element={<AdminCustomers />} />
            <Route path="/admin/production" element={<AdminProduction />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/gift-cards" element={<AdminGiftCards />} />
            <Route path="/admin/filament-inventory" element={<AdminFilamentInventoryPage />} />
            <Route path="/admin/price-calculator" element={<AdminPriceCalculatorPage />} />
            <Route path="/admin/order-files" element={<AdminOrderFiles />} />
            <Route path="/admin/assignments" element={<AdminAssignments />} />
            <Route path="/kleuren" element={<Kleuren />} />
            <Route path="/blog" element={<Blog />} />

            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <CookieBanner />
      <NewsletterPopup />
      <UploadProgressCenter />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
