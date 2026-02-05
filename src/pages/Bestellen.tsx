import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Check, Package, Loader2, FileType, Ruler, Box, AlertCircle, ShoppingCart, Trash2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const MAX_PRINT_SIZE = { x: 220, y: 220, z: 200 };
const MAX_FILE_SIZE_MB = 10;

const materials = [
  { 
    id: "pla", 
    name: "PLA", 
    price: 0.08,
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "blue", name: "Blauw", hex: "#0066FF" },
      { id: "green", name: "Groen", hex: "#00CC00" },
      { id: "leafgreen", name: "Bladgroen", hex: "#228B22" },
      { id: "red", name: "Rood", hex: "#FF0000" },
      { id: "yellow", name: "Geel", hex: "#FFDD00" },
      { id: "grey", name: "Grijs", hex: "#808080" },
    ]
  },
  { 
    id: "petg", 
    name: "PETG", 
    price: 0.10,
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "red", name: "Rood", hex: "#FF0000" },
    ]
  },
  { 
    id: "tpu", 
    name: "TPU", 
    price: 0.10,
    colors: [
      { id: "black", name: "Zwart", hex: "#000000" },
    ]
  },
];

// Kant-en-klare modellen met vaste prijs
const prebuiltModels = [
  {
    id: "phone-stand",
    name: "Telefoonhouder",
    description: "Universele telefoonstandaard",
    price: 8.50,
    image: "📱",
  },
  {
    id: "keychain",
    name: "Sleutelhanger (aangepast)",
    description: "Gepersonaliseerde sleutelhanger met tekst",
    price: 5.00,
    image: "🔑",
  },
  {
    id: "cable-organizer",
    name: "Kabelhouder (3-pack)",
    description: "Houd je kabels netjes",
    price: 6.50,
    image: "🔌",
  },
  {
    id: "plant-pot",
    name: "Mini Plantenpot",
    description: "Decoratieve pot voor kleine planten",
    price: 12.00,
    image: "🪴",
  },
];

interface CartItem {
  id: string;
  type: "custom" | "prebuilt";
  name: string;
  material?: string;
  color?: string;
  quantity: number;
  price: number;
  file?: File;
  fileAnalysis?: {
    name: string;
    size: string;
    estimatedVolume: number;
    dimensions: { x: number; y: number; z: number };
  };
  prebuiltId?: string;
}

export default function Bestellen() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState<{
    name: string;
    size: string;
    estimatedVolume: number;
    dimensions: { x: number; y: number; z: number };
  } | null>(null);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const [printTooLarge, setPrintTooLarge] = useState(false);

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

    // Check file size (10MB limit)
    const fileSizeMB = file.size / 1024 / 1024;
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      setFileTooLarge(true);
      toast({
        title: "Bestand te groot",
        description: `Maximum bestandsgrootte is ${MAX_FILE_SIZE_MB}MB. Dit bestand is ${fileSizeMB.toFixed(1)}MB.`,
        variant: "destructive",
      });
      return;
    }
    setFileTooLarge(false);

    setFile(file);
    
    // Simulate file analysis (in real app, this would parse the 3D file)
    const randomVolume = Math.floor(Math.random() * 150) + 20;
    const dimensions = {
      x: Math.floor(Math.random() * 180) + 20,
      y: Math.floor(Math.random() * 180) + 20,
      z: Math.floor(Math.random() * 150) + 10,
    };

    // Check if print is too large
    const isTooLarge = dimensions.x > MAX_PRINT_SIZE.x || 
                       dimensions.y > MAX_PRINT_SIZE.y || 
                       dimensions.z > MAX_PRINT_SIZE.z;
    setPrintTooLarge(isTooLarge);

    setFileAnalysis({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + " MB",
      estimatedVolume: randomVolume,
      dimensions,
    });
  };

  const getCurrentMaterialColors = () => {
    const material = materials.find(m => m.id === selectedMaterial);
    return material?.colors || [];
  };

  const calculateItemPrice = (volume: number, materialId: string, qty: number) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return 0;
    const basePrice = volume * material.price;
    const setupFee = 5;
    return (basePrice + setupFee) * qty;
  };

  const calculateCartTotal = () => {
    return cart.reduce((total, item) => total + item.price, 0);
  };

  const addToCart = () => {
    if (!file || !fileAnalysis || !selectedMaterial || !selectedColor || printTooLarge) return;

    const newItem: CartItem = {
      id: `custom-${Date.now()}`,
      type: "custom",
      name: file.name,
      material: selectedMaterial,
      color: selectedColor,
      quantity,
      price: calculateItemPrice(fileAnalysis.estimatedVolume, selectedMaterial, quantity),
      file,
      fileAnalysis,
    };

    setCart([...cart, newItem]);
    
    // Reset form
    setFile(null);
    setFileAnalysis(null);
    setSelectedMaterial("");
    setSelectedColor("");
    setQuantity(1);
    setPrintTooLarge(false);

    toast({
      title: "Toegevoegd aan winkelwagen",
      description: `${file.name} is toegevoegd.`,
    });
  };

  const addPrebuiltToCart = (model: typeof prebuiltModels[0]) => {
    const existingItem = cart.find(item => item.prebuiltId === model.id);
    
    if (existingItem) {
      setCart(cart.map(item => 
        item.prebuiltId === model.id 
          ? { ...item, quantity: item.quantity + 1, price: model.price * (item.quantity + 1) }
          : item
      ));
    } else {
      const newItem: CartItem = {
        id: `prebuilt-${Date.now()}`,
        type: "prebuilt",
        name: model.name,
        quantity: 1,
        price: model.price,
        prebuiltId: model.id,
      };
      setCart([...cart, newItem]);
    }

    toast({
      title: "Toegevoegd aan winkelwagen",
      description: `${model.name} is toegevoegd.`,
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(item => item.id !== itemId));
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

    if (cart.length === 0) {
      toast({
        title: "Winkelwagen leeg",
        description: "Voeg eerst items toe aan je winkelwagen.",
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
            items: cart.map(item => ({
              name: item.name,
              type: item.type,
              material: item.material ? materials.find(m => m.id === item.material)?.name : undefined,
              color: item.color ? materials.find(m => m.id === item.material)?.colors.find(c => c.id === item.color)?.name : undefined,
              quantity: item.quantity,
              price: item.price.toFixed(2),
              dimensions: item.fileAnalysis?.dimensions,
              volume: item.fileAnalysis?.estimatedVolume,
            })),
            totalPrice: calculateCartTotal().toFixed(2),
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

  const canAddToCart = file && fileAnalysis && selectedMaterial && selectedColor && !printTooLarge;
  const canProceedToStep2 = cart.length > 0;
  const canSubmit = formData.name && formData.email && formData.address && formData.city && formData.postalCode && formData.agreeTerms && formData.notALightsaber && cart.length > 0;

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
                en je ontvangt een bevestigingsmail met alle details op {formData.email}.
              </p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-card rounded-2xl p-6 shadow-overweel-card text-left"
              >
                <h3 className="font-semibold mb-4">Samenvatting</h3>
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between text-sm border-b border-border pb-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        {item.material && (
                          <p className="text-muted-foreground text-xs">
                            {materials.find(m => m.id === item.material)?.name} - {item.quantity}x
                          </p>
                        )}
                      </div>
                      <span className="font-medium">€{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  <p className="text-lg font-bold text-accent pt-2">
                    Geschatte totaal: €{calculateCartTotal().toFixed(2)}
                  </p>
                </div>
              </motion.div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6 text-left">
                <p className="text-sm text-amber-800">
                  ⚠️ <strong>Let op:</strong> De prijs is niet definitief en kan nog afgewezen of aangepast worden na controle van de bestelling.
                </p>
              </div>

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
              Upload je 3D-model of kies een kant-en-klaar product, en wij doen de rest.
            </p>
          </motion.div>

          {/* Disclaimers */}
          <div className="max-w-4xl mx-auto mb-8 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                ⚠️ <strong>Belangrijk:</strong> De prijs is een schatting en kan nog aangepast of afgewezen worden na controle.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>Let op:</strong> Op de kant-en-klare modellen na worden onderdelen niet in elkaar gezet geleverd.
              </p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center gap-4">
              {[1, 2].map((s) => (
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
                  {s < 2 && (
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
                {/* Step 1: Products */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    {/* Pre-built Models */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Star className="w-6 h-6 text-accent" />
                        Kant-en-klare modellen
                      </h2>
                      <p className="text-sm text-muted-foreground mb-6">
                        Direct leverbaar tegen vaste prijs. Deze worden volledig afgemonteerd geleverd.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {prebuiltModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => addPrebuiltToCart(model)}
                            className="p-4 rounded-xl border-2 border-border hover:border-accent transition-all text-center group"
                          >
                            <div className="text-4xl mb-2">{model.image}</div>
                            <p className="font-semibold text-sm">{model.name}</p>
                            <p className="text-xs text-muted-foreground">{model.description}</p>
                            <p className="text-accent font-bold mt-2">€{model.price.toFixed(2)}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Upload */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Upload className="w-6 h-6 text-accent" />
                        Upload je eigen 3D-model
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
                              of klik om te selecteren. STL, OBJ, STEP ondersteund. Max {MAX_FILE_SIZE_MB}MB.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* File Analysis */}
                      {fileAnalysis && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6"
                        >
                          {/* Print too large warning */}
                          {printTooLarge && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                              <p className="text-sm text-red-800 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                <strong>Deze print is te groot!</strong> Maximale afmetingen zijn {MAX_PRINT_SIZE.x}×{MAX_PRINT_SIZE.y}×{MAX_PRINT_SIZE.z}mm.
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-4">
                            <div className={`rounded-lg p-4 text-center ${printTooLarge ? 'bg-red-50' : 'bg-muted'}`}>
                              <Ruler className={`w-5 h-5 mx-auto mb-2 ${printTooLarge ? 'text-red-500' : 'text-accent'}`} />
                              <p className="text-xs text-muted-foreground">Afmetingen</p>
                              <p className={`text-sm font-semibold ${printTooLarge ? 'text-red-600' : ''}`}>
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
                          </div>
                        </motion.div>
                      )}

                      {/* Material Selection */}
                      {file && fileAnalysis && !printTooLarge && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 space-y-6"
                        >
                          <div>
                            <Label className="text-sm font-medium mb-3 block">Materiaal</Label>
                            <div className="grid grid-cols-3 gap-3">
                              {materials.map((material) => (
                                <button
                                  key={material.id}
                                  onClick={() => {
                                    setSelectedMaterial(material.id);
                                    setSelectedColor("");
                                  }}
                                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                                    selectedMaterial === material.id
                                      ? "border-accent bg-accent/5"
                                      : "border-border hover:border-accent/50"
                                  }`}
                                >
                                  <p className="font-semibold">{material.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    €{material.price.toFixed(2)}/gram
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Color Selection */}
                          {selectedMaterial && (
                            <div>
                              <Label className="text-sm font-medium mb-3 block">Kleur</Label>
                              <div className="flex flex-wrap gap-3">
                                {getCurrentMaterialColors().map((color) => (
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
                                  Gekozen: {getCurrentMaterialColors().find(c => c.id === selectedColor)?.name}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Quantity */}
                          {selectedColor && (
                            <div>
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
                          )}

                          {/* Add to Cart Button */}
                          {canAddToCart && (
                            <Button
                              variant="hero"
                              onClick={addToCart}
                              className="w-full"
                            >
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Toevoegen aan winkelwagen (€{calculateItemPrice(fileAnalysis.estimatedVolume, selectedMaterial, quantity).toFixed(2)})
                            </Button>
                          )}
                        </motion.div>
                      )}
                    </div>

                    {/* Proceed Button */}
                    <div className="flex justify-end">
                      <Button
                        variant="hero"
                        onClick={() => setStep(2)}
                        disabled={!canProceedToStep2}
                      >
                        Verder naar gegevens ({cart.length} items)
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Contact Details */}
                {step === 2 && (
                  <motion.div
                    key="step2"
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
                      <Button variant="ghost" onClick={() => setStep(1)}>
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

            {/* Right Side - Cart Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl p-6 shadow-overweel-card"
                >
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Winkelwagen ({cart.length})
                  </h3>

                  {cart.length > 0 ? (
                    <div className="space-y-4">
                      {cart.map((item) => (
                        <div key={item.id} className="flex justify-between items-start border-b border-border pb-4">
                          <div className="flex-1">
                            <p className="font-medium text-sm truncate max-w-40">{item.name}</p>
                            {item.material && (
                              <p className="text-xs text-muted-foreground">
                                {materials.find(m => m.id === item.material)?.name} - {getCurrentMaterialColors().find(c => c.id === item.color)?.name || item.color}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">{item.quantity}x</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">€{item.price.toFixed(2)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      <div className="border-t border-border pt-4">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Geschatte totaal</span>
                          <span className="text-2xl font-bold text-accent">
                            €{calculateCartTotal().toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          * Definitieve prijs na controle van de bestelling
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">
                        Je winkelwagen is leeg
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
