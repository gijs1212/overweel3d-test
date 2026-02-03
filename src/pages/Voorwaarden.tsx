import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Scroll, Shield, Scale, AlertTriangle, FileText, Pizza, Handshake, Link } from "lucide-react";

const voorwaardenData = [
  {
    id: "art1",
    title: "Artikel 1 – Definities",
    icon: FileText,
    content: `In deze Heilige Scroll der Plastische Precisie wordt verstaan onder:

1.1 **Overweel3D**: De entiteit die jouw digitale dromen omzet in tastbare plastische werkelijkheid.

1.2 **Klant**: De dappere ziel die een bestelling plaatst, ook wel bekend als "de held van het print-epos".

1.3 **3D-print**: Het fysieke object dat ontstaat wanneer wij gesmolten filament laag voor laag met chirurgische precisie stapelen tot jouw ontwerp.

1.4 **Bestand**: Het digitale model (STL, OBJ, STEP) dat jij aanlevert en dat wij converteren naar printbare instructies.

1.5 **Filament**: De magische draad die door onze printers wordt gevoerd en transformeert in jouw creatie.`,
  },
  {
    id: "art2",
    title: "Artikel 2 – Toepasselijkheid",
    icon: Scale,
    content: `2.1 Deze voorwaarden zijn van toepassing op alle bestellingen, offertes en overeenkomsten tussen Overweel3D en de klant.

2.2 Door een bestelling te plaatsen, accepteert de klant deze voorwaarden in hun geheel. Er is geen ontsnappen mogelijk – behalve via de annuleringsknop (zie Artikel 5).

2.3 Afwijkingen van deze voorwaarden zijn alleen geldig indien schriftelijk overeengekomen. WhatsApp-berichten om 3 uur 's nachts tellen niet.

2.4 Wij behouden het recht om deze voorwaarden te wijzigen. Wijzigingen worden aangekondigd via onze website en/of via duivenpost (afhankelijk van beschikbaarheid).`,
  },
  {
    id: "art3",
    title: "Artikel 3 – Bestellingen & Prijzen",
    icon: Handshake,
    content: `3.1 Prijzen worden berekend op basis van materiaalverbruik, printtijd en complexiteit. Geen verborgen kosten – wij zijn transparanter dan PLA.

3.2 De geschatte prijs bij bestelling is indicatief. De definitieve prijs wordt vastgesteld na analyse van het model en gecommuniceerd voor productie.

3.3 Verzendkosten worden apart berekend, tenzij je bestelling de €50 passeert – dan vliegt het gratis naar je toe.

3.4 Betalingen worden verwerkt via de door ons aangeboden betaalmethoden. Betalen in Pokémon-kaarten wordt helaas niet geaccepteerd.

3.5 Bij niet-tijdige betaling behouden wij ons het recht voor om je print als gijzelaar te houden tot de schuld is voldaan.`,
  },
  {
    id: "art4",
    title: "Artikel 4 – Bestanden & Intellectueel Eigendom",
    icon: Shield,
    content: `4.1 De klant garandeert dat hij/zij gerechtigd is om het aangeleverde bestand te laten printen. Wij zijn niet verantwoordelijk voor auteursrechtelijke claims.

4.2 Wij bewaren bestanden maximaal 30 dagen na levering voor eventuele herbestellingen. Daarna verdwijnen ze in het digitale nirwana.

4.3 Bestanden worden niet gedeeld met derden, tenzij wettelijk verplicht of als je iets écht cools hebt gemaakt en we je om toestemming vragen.

4.4 Wij behouden het recht om anonieme prints te gebruiken voor promotionele doeleinden (foto's op social media). Herkenbare objecten worden alleen met toestemming gedeeld.`,
  },
  {
    id: "art5",
    title: "Artikel 5 – Annulering & Retourneren",
    icon: AlertTriangle,
    content: `5.1 Annuleren is mogelijk tot het moment dat de print daadwerkelijk start. Daarna is het filament al gesmolten en is er geen weg terug.

5.2 Bij annulering vóór productie worden geen kosten in rekening gebracht, behalve eventuele voorbereidingskosten indien van toepassing.

5.3 Vanwege het maatwerk karakter van 3D-prints is retourneren niet mogelijk, tenzij er sprake is van een productiefout aan onze kant.

5.4 Productiefout betekent: significant afwijkend van het originele ontwerp door toedoen van ons (niet: "ik had het me anders voorgesteld").

5.5 Claims dienen binnen 7 dagen na ontvangst te worden ingediend, voorzien van foto's. Wij zijn geen gedachtenlezers – communicatie is key.`,
  },
  {
    id: "art6",
    title: "Artikel 6 – Levertijd & Verzending",
    icon: Link,
    content: `6.1 Levertijden zijn indicatief en geen fatale termijnen. Gemiddeld 3-5 werkdagen, maar complexe prints kunnen langer duren.

6.2 Wij zijn niet aansprakelijk voor vertragingen door overmacht, stroomuitval, filament-jams, of invasies van buitenaardse wezens.

6.3 Verzending geschiedt via PostNL of een vergelijkbare dienstverlener. Tracking wordt verstrekt zodra het pakket onderweg is.

6.4 Bij beschadiging tijdens transport dient de klant dit direct bij de bezorger te melden en binnen 24 uur aan ons door te geven.`,
  },
  {
    id: "art7",
    title: "Artikel 7 – Aansprakelijkheid",
    icon: AlertTriangle,
    content: `7.1 Overweel3D is niet aansprakelijk voor schade ontstaan door:
- Onjuist gebruik van het geprinte object
- Modificaties aangebracht na levering
- Normale slijtage (ja, ook plastic slijt)
- Onrealistisch hoge verwachtingen

7.2 Onze aansprakelijkheid is in alle gevallen beperkt tot het orderbedrag.

7.3 Wij zijn niet verantwoordelijk voor functionele geschiktheid van het ontwerp – dat is jouw verantwoordelijkheid als ontwerper.

7.4 3D-prints zijn niet geschikt voor medische toepassingen, vliegtuigonderdelen, of als vervanging voor echte lightsabers in een duel.`,
  },
  {
    id: "art8",
    title: "Artikel 8 – Privacy & Gegevens",
    icon: Shield,
    content: `8.1 Wij verzamelen alleen gegevens die nodig zijn voor de uitvoering van je bestelling. Geen stiekeme tracking, geen verkoop aan derden.

8.2 Je gegevens worden beveiligd opgeslagen en na 2 jaar inactiviteit automatisch verwijderd.

8.3 Je hebt recht op inzage, correctie en verwijdering van je gegevens. Een mailtje volstaat.

8.4 Wij houden niet van spam en sturen alleen relevante updates over je bestelling. Geen nieuwsbrieven zonder expliciete toestemming.`,
  },
  {
    id: "art9",
    title: "Artikel 9 – Slotbepalingen",
    icon: Pizza,
    content: `9.1 Op deze voorwaarden is Nederlands recht van toepassing.

9.2 Geschillen worden bij voorkeur in onderling overleg opgelost. Mocht dat niet lukken, dan is de rechtbank in Nederland bevoegd.

9.3 Mocht enige bepaling nietig blijken, dan blijven de overige bepalingen van kracht.

9.4 Door verder te klikken verklaar je jezelf held van je eigen print-epos.

9.5 Het geheime codewoord is PLAFTASTIC. Gefeliciteerd, je hebt de hele scroll gelezen! 🎉

Laatste update: ${new Date().toLocaleDateString("nl-NL")}`,
  },
];

export default function Voorwaarden() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        {/* Header */}
        <section className="bg-hero-gradient py-20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 text-primary-foreground text-sm mb-6">
                <Scroll className="w-4 h-4" />
                <span>Officieel document</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
                De Heilige Scroll der Plastische Precisie
              </h1>
              <p className="text-lg text-primary-foreground/70">
                Oftewel: onze algemene voorwaarden. Maar dan leuker om te lezen.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Content */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Accordion type="single" collapsible className="space-y-4">
                  {voorwaardenData.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                    >
                      <AccordionItem
                        value={item.id}
                        className="bg-card rounded-xl shadow-overweel-card border-0 overflow-hidden"
                      >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50 [&[data-state=open]]:bg-accent/5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                              <item.icon className="w-5 h-5 text-accent" />
                            </div>
                            <span className="font-semibold text-left">{item.title}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                          <div className="pl-14 prose prose-sm max-w-none">
                            {item.content.split("\n").map((paragraph, i) => (
                              <p key={i} className="mb-2 text-muted-foreground whitespace-pre-wrap">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </motion.div>
                  ))}
                </Accordion>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-12 text-center"
                >
                  <p className="text-muted-foreground mb-6">
                    Door verder te klikken verklaar je jezelf held van je eigen print-epos.
                  </p>
                  <Button variant="hero" size="lg" asChild>
                    <a href="/bestellen">Ik ga akkoord! Print mijn toekomst.</a>
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
