import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, Scale, Handshake, CreditCard, XCircle, Truck, Archive, AlertTriangle, Shield, Ban, Lightbulb, Lock, Gavel } from "lucide-react";

const voorwaardenData = [
  {
    id: "art1",
    title: "Artikel 1 – Toepasselijkheid",
    icon: Scale,
    content: `Deze algemene voorwaarden zijn van toepassing op alle offertes, overeenkomsten en leveringen van Overweel3D.

Afwijkingen zijn slechts geldig indien schriftelijk overeengekomen.

Indien de klant handelt in de uitoefening van beroep of bedrijf (B2B), gelden aanvullende beperkingen zoals hieronder vermeld.`,
  },
  {
    id: "art2",
    title: "Artikel 2 – Diensten",
    icon: Lightbulb,
    content: `Overweel3D verzorgt 3D-printproductie op basis van door klant aangeleverde bestanden.

Maximale printafmeting: 250 x 250 x 250 mm.

Materialen:
• PLA – vanaf €0,03 per gram
• PETG – vanaf €0,04 per gram
• TPU – vanaf €0,04 per gram

Ontwerpwerk uitsluitend op speciale aanvraag.

Geen nabewerking tenzij schriftelijk overeengekomen.`,
  },
  {
    id: "art3",
    title: "Artikel 3 – Totstandkoming overeenkomst",
    icon: Handshake,
    content: `Een overeenkomst komt tot stand na schriftelijke bevestiging en ontvangst van volledige betaling.

Overweel3D behoudt zich het recht voor opdrachten te weigeren.`,
  },
  {
    id: "art4",
    title: "Artikel 4 – Prijzen en betaling",
    icon: CreditCard,
    content: `Prijzen worden berekend op basis van materiaalverbruik, printtijd en complexiteit.

Verzendkosten zijn niet inbegrepen.

Verzending via PostNL, volledig voor rekening van de klant.

Betalingstermijn: 14 dagen.

Productie start uitsluitend na ontvangst van volledige betaling.

Bij eerdere betaling kan productie eerder starten.`,
  },
  {
    id: "art5",
    title: "Artikel 5 – Annulering",
    icon: XCircle,
    content: `Annulering is kosteloos mogelijk zolang productie niet is gestart.

Na start van productie is annulering niet mogelijk en vindt geen restitutie plaats.`,
  },
  {
    id: "art6",
    title: "Artikel 6 – Levering en risico",
    icon: Truck,
    content: `Levering geschiedt door afhalen of verzending.

Verzendkosten zijn voor rekening van de klant.

Bij zakelijke klanten (B2B) gaat het risico over bij verzending.

Bij consumenten (B2C) gaat het risico over bij daadwerkelijke ontvangst van het product.`,
  },
  {
    id: "art7",
    title: "Artikel 7 – Opslag",
    icon: Archive,
    content: `Na voltooiing wordt klant geïnformeerd.

Indien niet opgehaald binnen 2 weken, geldt €5 opslag per week.

Opslagkosten blijven verschuldigd totdat product is afgehaald of verzonden.`,
  },
  {
    id: "art8",
    title: "Artikel 8 – Klachten",
    icon: AlertTriangle,
    content: `Klachten dienen binnen 3 dagen na levering schriftelijk gemeld te worden.

Kleine afwijkingen binnen gebruikelijke toleranties (±0,2–0,5 mm) vormen geen grond voor afkeuring.

Bij consumenten geldt de wettelijke conformiteitseis (artikel 7:17 BW).`,
  },
  {
    id: "art9",
    title: "Artikel 9 – Garantie en conformiteit",
    icon: Shield,
    content: `9.1 Geen commerciële garantie
Overweel3D verstrekt geen aanvullende commerciële garantie.

9.2 Consumenten (B2C)
Voor consumenten geldt dat het product moet voldoen aan de redelijke verwachtingen die op basis van de overeenkomst bestaan (wettelijke conformiteit).

Gezien de aard van 3D-printing geldt nadrukkelijk:
• Lijnstructuur en zichtbare laagopbouw zijn normaal.
• Kleine maat- of structuurafwijkingen zijn inherent aan FDM-printtechniek.
• Producten zijn niet getest voor specifieke toepassingen tenzij schriftelijk overeengekomen.

Indien een product niet conform is, zal Overweel3D naar eigen keuze herstellen, vervangen of een redelijke compensatie bieden.

9.3 Zakelijke klanten (B2B)
Voor zakelijke klanten wordt iedere garantie uitgesloten, tenzij sprake is van opzet of bewuste roekeloosheid.`,
  },
  {
    id: "art10",
    title: "Artikel 10 – Aansprakelijkheid",
    icon: AlertTriangle,
    content: `10.1 Algemeen
Gebruik van 3D-geprinte producten is volledig op eigen risico.

10.2 Uitsluitingen
Overweel3D is niet aansprakelijk voor:
• Fouten in aangeleverde bestanden
• Functionele geschiktheid voor specifieke toepassingen
• Slijtage, breuk of vervorming na levering
• Indirecte schade of gevolgschade
• Schade ontstaan door onjuist gebruik

10.3 Beperking
Indien aansprakelijkheid wettelijk vaststaat, is deze beperkt tot maximaal het factuurbedrag van de betreffende opdracht.

Voor B2B geldt een volledige uitsluiting van indirecte schade.`,
  },
  {
    id: "art11",
    title: "Artikel 11 – Intellectueel eigendom",
    icon: FileText,
    content: `Aangeleverde bestanden blijven eigendom van klant.

Overweel3D mag geproduceerde prints tonen in portfolio of social media, tenzij vooraf schriftelijk bezwaar is gemaakt.

Door Overweel3D gemaakte ontwerpen blijven eigendom van Overweel3D tenzij anders overeengekomen.`,
  },
  {
    id: "art12",
    title: "Artikel 12 – Beperkingen gebruik",
    icon: Ban,
    content: `Producten zijn niet geschikt voor:
• Voedselcontact
• Medisch gebruik
• Veiligheidskritische toepassingen
• Dragende constructies

Gebruik is volledig op eigen risico.`,
  },
  {
    id: "art13",
    title: "Artikel 13 – Toepasselijk recht",
    icon: Gavel,
    content: `Op alle overeenkomsten is Nederlands recht van toepassing.`,
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
                <FileText className="w-4 h-4" />
                <span>Officieel document</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
                Algemene Voorwaarden
              </h1>
              <p className="text-lg text-primary-foreground/70">
                Overweel3D – Eenmanszaak (ZZP), gevestigd in Nederland. Levering uitsluitend binnen Nederland.
              </p>
              <p className="text-sm text-primary-foreground/50 mt-2">Versie 2026</p>
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
                  <Button variant="hero" size="lg" asChild>
                    <a href="/bestellen">Bestelling plaatsen</a>
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
