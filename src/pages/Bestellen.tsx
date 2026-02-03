import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Check, Package, Loader2, FileType, Ruler, Box, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const materials = [
  { id: "pla", name: "PLA", price: 0.08 },
  { id: "petg", name: "PETG", price: 0.10 },
  { id: "abs", name: "ABS", price: 0.12 },
  { id: "tpu", name: "TPU", price: 0.15 },
];

const colors = [
  { id: "black", name: "Zwart", hex: "#000000" },
  { id: "white", name: "Wit", hex: "#FFFFFF" },
  { id: "red", name: "Rood", hex: "#FF0000" },
  { id: "blue", name: "Blauw", hex: "#0066FF" },
  { id: "green", name: "Groen", hex: "#00CC00" },
  { id: "yellow", name: "Geel", hex: "#FFDD00" },
  { id: "orange", name: "Oranje", hex: "#FF6600" },
  { id: "grey", name: "Grijs", hex: "#808080" },
];

export default function Bestellen() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState<{
    name: string;
    size: string;
    estimatedVolume: number;
    dimensions: { x: number; y: number; z: number };
  } | null>(null);

  // Selection state
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    notes: "",
    agreeTerms: false,
    notALightsaber: false,
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    processFile(droppedFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (file: File) => {
    const validExtensions = [".stl", ".obj", ".step", ".stp"];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    
    if (!validExtensions.includes(extension)) {
      toast({
        title: "Ongeldig bestandstype",
        description: "Upload een STL, OBJ of STEP bestand.",
        variant: "destructive",
      });
      return;
    }

    setFile(file);
    
    // Simulate file analysis (in real app, this would parse the 3D file)
    const randomVolume = Math.floor(Math.random() * 150) + 20;
    setFileAnalysis({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + " MB",
      estimatedVolume: randomVolume,
      dimensions: {
        x: Math.floor(Math.random() * 100) + 20,
        y: Math.floor(Math.random() * 100) + 20,
        z: Math.floor(Math.random() * 50) + 10,
      },
    });
  };

  const calculatePrice = () => {
    if (!fileAnalysis || !selectedMaterial) return 0;
    const material = materials.find(m => m.id === selectedMaterial);
    if (!material) return 0;
    
    const basePrice = fileAnalysis.estimatedVolume * material.price;
    const setupFee = 5;
    return (basePrice + setupFee) * quantity;
  };

  const handleSubmit = async () => {
    if (!formData.agreeTerms) {
      toast({
        title: "Voorwaarden",
        description: "Accepteer de algemene voorwaarden om door te gaan.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Call edge function to send email notification
      const { error } = await supabase.functions.invoke("send-order-notification", {
        body: {
          orderDetails: {
            fileName: file?.name || "Onbekend",
            material: materials.find(m => m.id === selectedMaterial)?.name || selectedMaterial,
            color: colors.find(c => c.id === selectedColor)?.name || selectedColor,
            quantity,
            estimatedPrice: calculatePrice().toFixed(2),
            dimensions: fileAnalysis?.dimensions,
            volume: fileAnalysis?.estimatedVolume,
          },
          customer: {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            postalCode: formData.postalCode,
            notes: formData.notes,
          },
        },
      });

      if (error) throw error;

      setOrderComplete(true);
      toast({
        title: "Bestelling geplaatst!",
        description: "Je ontvangt binnenkort een bevestigingsmail.",
      });
    } catch (error) {
      console.error("Order error:", error);
      toast({
        title: "Er ging iets mis",
        description: "Probeer het opnieuw of neem contact met ons op.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceedToStep2 = file && fileAnalysis;
  const canProceedToStep3 = selectedMaterial && selectedColor;
  const canSubmit = formData.name && formData.email && formData.address && formData.city && formData.postalCode && formData.agreeTerms && formData.notALightsaber;

  if (orderComplete) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-lg mx-auto text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-24 h-24 mx-auto mb-8 rounded-full bg-accent flex items-center justify-center"
              >
                <Check className="w-12 h-12 text-accent-foreground" />
              </motion.div>
              
              <h1 className="text-3xl font-bold text-primary mb-4">
                Bestelling geplaatst! 🎉
              </h1>
              <p className="text-muted-foreground mb-8">
                Je bestelling vliegt nu digitaal naar ons toe. We gaan direct aan de slag 
                en je ontvangt een bevestigingsmail met alle details.
              </p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-card rounded-2xl p-6 shadow-overweel-card text-left"
              >
                <h3 className="font-semibold mb-4">Samenvatting</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Bestand:</span> {file?.name}</p>
                  <p><span className="text-muted-foreground">Materiaal:</span> {materials.find(m => m.id === selectedMaterial)?.name}</p>
                  <p><span className="text-muted-foreground">Kleur:</span> {colors.find(c => c.id === selectedColor)?.name}</p>
                  <p><span className="text-muted-foreground">Aantal:</span> {quantity}</p>
                  <p className="text-lg font-bold text-accent pt-2">
                    Geschatte prijs: €{calculatePrice().toFixed(2)}
                  </p>
                </div>
              </motion.div>

              <p className="text-sm text-muted-foreground mt-8">
                PS: Het geheime codewoord is <span className="font-mono text-accent">PLAFTASTIC</span> 🤫
              </p>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">
              Plaats je bestelling
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload je 3D-model, kies je voorkeuren, en wij doen de rest.
            </p>
          </motion.div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center gap-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <motion.div
                    animate={{
                      backgroundColor: step >= s ? "hsl(var(--accent))" : "hsl(var(--muted))",
                      scale: step === s ? 1.1 : 1,
                    }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      color: step >= s ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {step > s ? <Check className="w-5 h-5" /> : s}
                  </motion.div>
                  {s < 3 && (
                    <div
                      className={`w-16 md:w-24 h-1 mx-2 rounded-full transition-colors ${
                        step > s ? "bg-accent" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Side - Form Steps */}
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {/* Step 1: Upload */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-card rounded-2xl p-8 shadow-overweel-card"
                  >
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Upload className="w-6 h-6 text-accent" />
                      Upload je 3D-model
                    </h2>

                    {/* Drop Zone */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                        isDragging
                          ? "border-accent bg-accent/5"
                          : file
                          ? "border-accent/50 bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".stl,.obj,.step,.stp"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      
                      {file ? (
                        <div className="space-y-4">
                          <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
                            <FileType className="w-8 h-8 text-accent" />
                          </div>
                          <p className="font-semibold text-primary">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Klik of sleep om een ander bestand te kiezen
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <p className="font-semibold text-primary">
                            Sleep je bestand hierheen
                          </p>
                          <p className="text-sm text-muted-foreground">
                            of klik om te selecteren. STL, OBJ, STEP ondersteund.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* File Analysis */}
                    {fileAnalysis && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 grid grid-cols-3 gap-4"
                      >
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <Ruler className="w-5 h-5 mx-auto mb-2 text-accent" />
                          <p className="text-xs text-muted-foreground">Afmetingen</p>
                          <p className="text-sm font-semibold">
                            {fileAnalysis.dimensions.x} × {fileAnalysis.dimensions.y} × {fileAnalysis.dimensions.z} mm
                          </p>
                        </div>
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <Box className="w-5 h-5 mx-auto mb-2 text-accent" />
                          <p className="text-xs text-muted-foreground">Volume</p>
                          <p className="text-sm font-semibold">~{fileAnalysis.estimatedVolume} cm³</p>
                        </div>
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <FileType className="w-5 h-5 mx-auto mb-2 text-accent" />
                          <p className="text-xs text-muted-foreground">Bestandsgrootte</p>
                          <p className="text-sm font-semibold">{fileAnalysis.size}</p>
                        </div>
                      </motion.div>
                    )}

                    <div className="mt-8 flex justify-end">
                      <Button
                        variant="hero"
                        onClick={() => setStep(2)}
                        disabled={!canProceedToStep2}
                      >
                        Verder naar materiaal
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Material & Color */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-card rounded-2xl p-8 shadow-overweel-card"
                  >
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Package className="w-6 h-6 text-accent" />
                      Kies materiaal & kleur
                    </h2>

                    {/* Material Selection */}
                    <div className="mb-8">
                      <Label className="text-sm font-medium mb-3 block">Materiaal</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {materials.map((material) => (
                          <button
                            key={material.id}
                            onClick={() => setSelectedMaterial(material.id)}
                            className={`p-4 rounded-xl border-2 transition-all text-left ${
                              selectedMaterial === material.id
                                ? "border-accent bg-accent/5"
                                : "border-border hover:border-accent/50"
                            }`}
                          >
                            <p className="font-semibold">{material.name}</p>
                            <p className="text-sm text-muted-foreground">
                              €{material.price}/gram
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Selection */}
                    <div className="mb-8">
                      <Label className="text-sm font-medium mb-3 block">Kleur</Label>
                      <div className="flex flex-wrap gap-3">
                        {colors.map((color) => (
                          <button
                            key={color.id}
                            onClick={() => setSelectedColor(color.id)}
                            className={`group relative w-12 h-12 rounded-full border-4 transition-all ${
                              selectedColor === color.id
                                ? "border-accent scale-110"
                                : "border-transparent hover:scale-105"
                            }`}
                            style={{ backgroundColor: color.hex }}
                            title={color.name}
                          >
                            {selectedColor === color.id && (
                              <Check
                                className={`absolute inset-0 m-auto w-6 h-6 ${
                                  color.hex === "#FFFFFF" || color.hex === "#FFDD00"
                                    ? "text-primary"
                                    : "text-primary-foreground"
                                }`}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                      {selectedColor && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Gekozen: {colors.find(c => c.id === selectedColor)?.name}
                        </p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="mb-8">
                      <Label className="text-sm font-medium mb-3 block">Aantal</Label>
                      <div className="flex items-center gap-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        >
                          -
                        </Button>
                        <span className="text-xl font-bold w-12 text-center">{quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setQuantity(quantity + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setStep(1)}>
                        Terug
                      </Button>
                      <Button
                        variant="hero"
                        onClick={() => setStep(3)}
                        disabled={!canProceedToStep3}
                      >
                        Verder naar gegevens
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Contact Details */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-card rounded-2xl p-8 shadow-overweel-card"
                  >
                    <h2 className="text-xl font-bold mb-6">Jouw gegevens</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <Label htmlFor="name">Naam *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Je volledige naam"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">E-mail *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="je@email.nl"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefoon</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="06-12345678"
                        />
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postcode *</Label>
                        <Input
                          id="postalCode"
                          value={formData.postalCode}
                          onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                          placeholder="1234 AB"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="address">Adres *</Label>
                        <Input
                          id="address"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          placeholder="Straat en huisnummer"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="city">Plaats *</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="Woonplaats"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="notes">Opmerkingen</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Speciale wensen of instructies..."
                          rows={3}
                        />
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-4 mb-8">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="notLightsaber"
                          checked={formData.notALightsaber}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, notALightsaber: checked as boolean })
                          }
                        />
                        <Label htmlFor="notLightsaber" className="text-sm leading-relaxed cursor-pointer">
                          Ik verklaar dat dit geen lightsaber of emotionele wraak is 🤺
                        </Label>
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="terms"
                          checked={formData.agreeTerms}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, agreeTerms: checked as boolean })
                          }
                        />
                        <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                          Ik ga akkoord met de{" "}
                          <a href="/voorwaarden" className="text-accent underline" target="_blank">
                            Heilige Scroll der Plastische Precisie
                          </a>{" "}
                          (algemene voorwaarden)
                        </Label>
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setStep(2)}>
                        Terug
                      </Button>
                      <Button
                        variant="hero"
                        onClick={handleSubmit}
                        disabled={!canSubmit || isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Bestelling plaatsen...
                          </>
                        ) : (
                          "Bestelling plaatsen"
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Side - Price Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl p-6 shadow-overweel-card"
                >
                  <h3 className="text-lg font-bold mb-6">Prijsoverzicht</h3>

                  {fileAnalysis ? (
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Bestand</span>
                        <span className="font-medium truncate max-w-32">{fileAnalysis.name}</span>
                      </div>
                      {selectedMaterial && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Materiaal</span>
                          <span className="font-medium">
                            {materials.find(m => m.id === selectedMaterial)?.name}
                          </span>
                        </div>
                      )}
                      {selectedColor && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Kleur</span>
                          <span className="font-medium">
                            {colors.find(c => c.id === selectedColor)?.name}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Aantal</span>
                        <span className="font-medium">{quantity}x</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Volume</span>
                        <span className="font-medium">~{fileAnalysis.estimatedVolume} cm³</span>
                      </div>
                      
                      <div className="border-t border-border pt-4 mt-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Materiaalkosten</span>
                          <span>
                            €{(
                              (fileAnalysis.estimatedVolume *
                                (materials.find(m => m.id === selectedMaterial)?.price || 0)) *
                              quantity
                            ).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Opstartkosten</span>
                          <span>€{(5 * quantity).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Geschatte totaal</span>
                          <span className="text-2xl font-bold text-accent">
                            €{calculatePrice().toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          * Definitieve prijs na controle van het model
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">
                        Upload een bestand om de prijs te berekenen
                      </p>
                    </div>
                  )}
                </motion.div>

                {/* Trust indicators */}
                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-accent" />
                    <span>Geen betaling vooraf nodig</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-accent" />
                    <span>Prijsgarantie na bevestiging</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-accent" />
                    <span>Gratis verzending vanaf €50</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
