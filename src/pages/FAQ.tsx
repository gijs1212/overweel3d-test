import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Package, Clock, CreditCard, Printer, AlertCircle, Palette, FileType } from "lucide-react";

const faqData = [
  {
    category: "Bestellen",
    icon: Package,
    questions: [
      {
        q: "Welke bestandsformaten accepteren jullie?",
        a: "Wij accepteren STL, OBJ en STEP bestanden. STL is het meest gangbaar en werkt vrijwel altijd perfect. Twijfelt u? Upload gerust en we checken het voor u.",
      },
      {
        q: "Hoe weet ik of mijn model printbaar is?",
        a: "Na upload analyseren we automatisch uw model. We checken op manifold errors, te dunne wanden en overhangs. Als er problemen zijn, nemen we contact op vóór we starten.",
      },
      {
        q: "Kan ik m'n ex laten printen?",
        a: "Nee. We printen alleen digitale modellen, geen levende wezens of emotionele wraak. Wel een schattig hondenbeeldje? Daar doen we wél aan.",
      },
    ],
  },
  {
    category: "Materialen",
    icon: Palette,
    questions: [
      {
        q: "Wat is het verschil tussen PLA, PETG, ABS en TPU?",
        a: "PLA is milieuvriendelijk en perfect voor decoratieve items. PETG is sterker en hittebestendiger. ABS is industriële kwaliteit. TPU is flexibel als rubber. Wij adviseren graag!",
      },
      {
        q: "Welke kleuren zijn beschikbaar?",
        a: "We hebben een breed palet: zwart, wit, rood, blauw, groen, geel, oranje, grijs en meer. Niet alle kleuren zijn voor elk materiaal beschikbaar – check de opties bij het bestellen.",
      },
      {
        q: "Is PLA voedselveilig?",
        a: "Technisch gezien is PLA food-safe, maar 3D-prints zijn dat niet automatisch. Door de laagjes kunnen bacteriën zich nestelen. Voor éénmalig gebruik mogelijk, voor dagelijks gebruik raden we het af.",
      },
    ],
  },
  {
    category: "Prijs & Betaling",
    icon: CreditCard,
    questions: [
      {
        q: "Hoe wordt de prijs berekend?",
        a: "De prijs hangt af van materiaalverbruik (volume), het type materiaal, en eventuele complexiteit. U krijgt altijd eerst een offerte voordat we starten.",
      },
      {
        q: "Zijn er verborgen kosten?",
        a: "Nee! We zijn transparanter dan helder PLA. Je ziet de geschatte prijs direct, en de definitieve prijs wordt gecommuniceerd vóór productie.",
      },
      {
        q: "Moet ik vooraf betalen?",
        a: "Nee, pas na goedkeuring van de offerte. Je krijgt betaalinstructies zodra we je model hebben geanalyseerd en de definitieve prijs hebben vastgesteld.",
      },
      {
        q: "Hoe kan ik betalen?",
        a: "Betaling gaat via Tikkie. Bij grotere bestellingen is betaling via factuur mogelijk, maar dit is niet altijd beschikbaar. We bespreken de mogelijkheden bij je bestelling.",
      },
    ],
  },
  {
    category: "Levertijd",
    icon: Clock,
    questions: [
      {
        q: "Hoe lang duurt het voordat ik mijn print heb?",
        a: "Gemiddeld 3-5 werkdagen, afhankelijk van grootte en drukte. Spoedorders? Neem contact op, we kijken wat mogelijk is.",
      },
      {
        q: "Kan ik mijn bestelling tracken?",
        a: "Ja! Zodra je pakket onderweg is, krijg je een track & trace code. Je kunt live meekijken hoe je print naar je toe reist.",
      },
      {
        q: "Leveren jullie ook in België?",
        a: "Jazeker! We verzenden naar Nederland en België. Verzendkosten kunnen variëren, dit zie je bij het afrekenen.",
      },
    ],
  },
  {
    category: "Kwaliteit & Problemen",
    icon: AlertCircle,
    questions: [
      {
        q: "Wat als mijn print beschadigd aankomt?",
        a: "Maak foto's en neem binnen 24 uur contact op. Bij transportschade regelen we een nieuwe print of volledige refund.",
      },
      {
        q: "Wat is jullie kwaliteitsstandaard?",
        a: "We printen standaard op 0.2mm layer height met 20% infill. Hogere kwaliteit of meer sterkte? Geef het aan bij je bestelling.",
      },
      {
        q: "Kan ik een prototype eerst goedkeuren?",
        a: "Voor grote of dure projecten kunnen we foto's sturen van de eerste laag of tussentijdse updates. Geef dit aan bij je bestelling.",
      },
    ],
  },
  {
    category: "Technisch",
    icon: Printer,
    questions: [
      {
        q: "Wat is de maximale printgrootte?",
        a: "Onze printers kunnen tot 250 x 250 x 250 mm. Groter nodig? We kunnen modellen in delen printen die je achteraf kunt assembleren.",
      },
      {
        q: "Kunnen jullie supports en rafts verwijderen?",
        a: "Ja, we verwijderen supports standaard. Kleine restanten zijn soms zichtbaar – dat hoort bij FDM printing. We doen ons best voor een mooie finish.",
      },
      {
        q: "Wat is infill en welke percentage moet ik kiezen?",
        a: "Infill is de 'vulling' binnenin je print. 20% is standaard en voldoende voor decoratie. Functionele onderdelen? 50-100% maakt ze steviger.",
      },
    ],
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        {/* Header */}
        <section className="py-16 bg-secondary/50">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm mb-6">
                <HelpCircle className="w-4 h-4" />
                <span>Veelgestelde vragen</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                Hoe kunnen we helpen?
              </h1>
              <p className="text-lg text-muted-foreground">
                Van bestandsformaten tot levertijden – hier vind je antwoord op de meest gestelde vragen.
              </p>
            </motion.div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-12">
              {faqData.map((category, catIndex) => (
                <motion.div
                  key={category.category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: catIndex * 0.1 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <category.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h2 className="text-2xl font-bold text-primary">{category.category}</h2>
                  </div>

                  <Accordion type="single" collapsible className="space-y-3">
                    {category.questions.map((item, index) => (
                      <AccordionItem
                        key={index}
                        value={`${category.category}-${index}`}
                        className="bg-card rounded-xl shadow-overweel-sm border-0 overflow-hidden"
                      >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50 text-left">
                          <span className="font-medium pr-4">{item.q}</span>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                          <p className="text-muted-foreground leading-relaxed">{item.a}</p>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.div>
              ))}
            </div>

            {/* Still have questions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl mx-auto mt-16 text-center"
            >
              <h3 className="text-2xl font-bold text-primary mb-4">
                Staat je vraag er niet tussen?
              </h3>
              <p className="text-muted-foreground mb-6">
                Geen probleem! Neem contact met ons op en we helpen je graag verder.
              </p>
              <a href="/contact">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold shadow-overweel-glow"
                >
                  Neem contact op
                </motion.button>
              </a>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
