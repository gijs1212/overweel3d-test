import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Steps } from "@/components/Steps";
import { Materials } from "@/components/Materials";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import { WhyBento } from "@/components/WhyBento";

const Index = () => {
  return (
    <div className="min-h-dvh bg-navy-deep">
      <Navbar />
      <main>
        <Hero />
        <WhyBento />
        <Steps />
        <Materials />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
