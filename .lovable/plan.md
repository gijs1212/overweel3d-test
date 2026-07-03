
# Overweel3D — Premium Navy Bento redesign

Volledige visuele + tekstuele overhaul van de hele site. Alle backend, Supabase-schema's, edge functions, auth, upload-, order-, admin-, blog- en emailflows blijven exact hetzelfde. Alleen presentatielaag, tokens, layouts en copy veranderen. Bron van waarheid voor stijl = het gekozen "Premium Navy Bento" prototype.

## Design tokens (verplicht, verbatim uit prototype)

- Palette (HSL in `index.css`): navy diep `#0f1b3d`, navy mid `#1e3a5f`, blauw accent `#3b6fa0`, ijs/tekst `#e8edf3`, wit `#FFFFFF`, success emerald `#10B981`.
- Typografie: Sora 600/700 headings, Manrope 400/500 body — via `@fontsource/sora` en `@fontsource/manrope`, geïmporteerd in `src/main.tsx`, gemapt in `tailwind.config.ts` (`font-display` = Sora, `font-sans` = Manrope). Geen Space Grotesk meer, geen Google Fonts `<link>`.
- Radius: `--radius = 1rem`; cards 20px (rounded-3xl), buttons 14px (rounded-xl), inputs 16px, dialogs 24px, badges pill.
- Shadows: alleen zachte varianten (klein + hover); geen zware glows.
- Standaard achtergrond = navy diep; witte varianten alleen op licht-geaccentueerde blokken indien nodig.

## Navigatie & shell

- `Navbar.tsx`: sticky, transparant → `backdrop-blur` + subtiele border op scroll, geanimeerde onderstreping actief item, CTA "Upload ontwerp". Menu: Home, 3D Print Service, Materialen, Projecten, Upload, FAQ, Over ons, Contact, Admin (indien admin).
- Mobiel: shadcn `Sheet` als slide-up drawer, grote knoppen + Quick Upload.
- `Footer.tsx`: kolommen Navigatie / Diensten / Bedrijf / Contact + juridische rij.

## Publieke pagina's

- **Home (`Index.tsx`)**: exact volgens gekozen prototype — hero (badge, headline "Van idee naar hoogwaardige 3D-print.", intro, twee CTA's, 4 trust badges), bento-grid met tegels Waarom Overweel3D, Industriële Prototypes, Beschikbare Materialen, Uniek Maatwerk. Daaronder secties Hoe het werkt (5-staps timeline), Diensten (bento), Projecten preview, FAQ preview, Contact-CTA-banner ("Klaar om te printen?"). Framer Motion fadeUp + hover-lift.
- **Materialen sectie/pagina**: 3 kaarten PLA/PETG/TPU met eigenschappen, geen prijzen. Sluit af met "Iedere opdracht is uniek. Daarom ontvangt u altijd vrijblijvend een offerte op basis van onder andere materiaal, printtijd, afwerking en eventuele nabewerking." Prijs-per-gram, €/kg en materiaalprijs-tabellen worden uit alle publieke UI verwijderd (`Materials.tsx`, `NewOrder.tsx` klantvlak, FAQ, blog). Admin filament-calculator + margin blijft ongewijzigd.
- **Opdrachten / Projecten**: gallery met hover-zoom en lightbox via bestaande `ProductDetailDialog`.
- **FAQ**: nieuwe vragen (bestanden, offerteproces, zonder 3D-bestand bestellen, materialen, doorlooptijd, verzending, meerdere onderdelen, prototypes), shadcn Accordion.
- **Contact**: uitnodigende rewrite + grote CTA.
- **Voorwaarden / Blog / BlogPost**: hergestileerd, content ongewijzigd.
- **NewOrder (Upload)**: visuele wizard met grote drag-and-drop, geanimeerde progress, review-kaart, success-animatie. Winkelmandje, kortingscode-veld bij gegevens, delivery scheduler, auth gate, alle bestaande logica intact.

## Ingelogde pagina's

- **Dashboard**: order-timeline, statuskaarten, stats, empty-state met illustratie + CTA.
- **Profile / Login / Register / Forgot / Reset**: nieuwe cards, floating labels, inline validatie-animaties. Auth-logica ongewijzigd.
- **OrderDetail**: twee-koloms premium layout — bestanden/preview links, timeline/status/acties rechts. `OrderChat`, `PlateTracker`, `ModelViewer`, `DeliveryScheduler`, `PrintProgress` hergestileerd.

## Admin shell

- Shadcn `Sidebar` (`SidebarProvider`) om admin-routes: Dashboard, Bestellingen, Producten, Blog, Content Marketing, Kortingscodes. Header met `SidebarTrigger` + globale zoek.
- `AdminDashboard`: stats-kaarten, status-overzicht, recente activiteit, quick actions.
- `AdminOrderEdit`, `AdminNewOrder`, `AdminProducts`, `AdminBlog`, `AdminContentMarketing`, `AdminDiscountCodes`: hergestileerd; filament-calculator + marge, plate tracker, HEIC-upload, email-triggers, kortingscodes: alle logica exact behouden.
- Tables: rounded, sticky headers, hover rows, statusbadges.

## Gedeelde primitives

- Button-varianten hergestileerd (`default`, `hero`, `outline`, `ghost`, `success`) met nieuwe tokens.
- Sonner top-right met success/warning/info/error animaties.
- Skeletons voor alle data-loading views.
- Nieuw: `src/components/EmptyState.tsx`, `src/components/MediaImage.tsx` (lazy + hover zoom), `src/lib/motion.ts` (fadeUp/fadeIn/stagger), `src/components/admin/AdminLayout.tsx` + `AdminSidebar.tsx`.

## Copy (Nederlands, formeel u/uw)

Rewrite van alle publieke strings: Hero, Steps, Materials, CTASection, Testimonials, Footer, FAQ, Contact, Voorwaarden intro, NewOrder-labels, Dashboard empty states, admin sectie-titels. Korte zinnen, bullets, klantvoordelen boven specs.

## Accessibility & performance

- Eén `<main>` per route, semantische headings, `aria-label` op icon-only buttons, focus-visible via `--ring`.
- `h-dvh` waar volledige viewport nodig is.
- `loading="lazy"` + `alt` op alle images.
- `React.lazy` voor admin-pagina's om initial bundle te verkleinen.

## SEO

`index.html`: title "Overweel3D — Professionele 3D-printservice op maat" + meta description, og:title/description/type, twitter:card.

## Technische sectie

**Files aangeraakt (alleen presentatie):**

- Tokens/config: `src/index.css`, `tailwind.config.ts`, `src/main.tsx`, `index.html`.
- Nieuw: `src/lib/motion.ts`, `src/components/EmptyState.tsx`, `src/components/MediaImage.tsx`, `src/components/admin/AdminLayout.tsx`, `src/components/admin/AdminSidebar.tsx`.
- Herschreven shells/pages: `Navbar.tsx`, `Footer.tsx`, `Hero.tsx`, `Steps.tsx`, `Materials.tsx`, `CTASection.tsx`, `Testimonials.tsx`, `Index.tsx`, `FAQ.tsx`, `Contact.tsx`, `Opdrachten.tsx`, `Voorwaarden.tsx`, `Blog.tsx`, `BlogPost.tsx`, `NewOrder.tsx`, `Dashboard.tsx`, `Profile.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `OrderDetail.tsx`, `AdminDashboard.tsx`, `AdminOrderEdit.tsx`, `AdminNewOrder.tsx`, `AdminProducts.tsx`, `AdminBlog.tsx`, `AdminContentMarketing.tsx`, `AdminDiscountCodes.tsx`, `ProductTile.tsx`, `ProductDetailDialog.tsx`, `PlateTracker.tsx`, `OrderChat.tsx`, `DeliveryScheduler.tsx`, `PrintProgress.tsx`.
- Niet aangeraakt: `src/hooks/useAuth.tsx`, `src/integrations/supabase/**`, `supabase/**` migraties + edge functions, `src/lib/productPhotos.ts`, `src/lib/stlParser.ts`, `ModelViewer` interne three.js-logica, routes-tabel in `App.tsx` (structuur ongewijzigd, wel `React.lazy` admin).

**Uitrol in fasen (preview blijft werken):**

1. Tokens + fonts + Navbar + Footer + Hero.
2. Home bento-secties (Waarom, Diensten, Materialen zonder prijzen, Hoe het werkt, Projecten, FAQ preview, CTA).
3. Publieke sub-pagina's: FAQ, Contact, Opdrachten, Voorwaarden, Blog.
4. NewOrder / OrderDetail / Dashboard / auth-pagina's.
5. Admin sidebar-shell + alle admin-pagina restyles.
6. QA: build, `rg -i "per gram|€.*/kg|prijs per|filament.*prijs"` op `src/` om te bewijzen dat er geen publieke prijzen resten, Playwright-screenshots van `/`, `/bestellen`, `/dashboard`, `/admin`, `/admin/order/:id` op desktop en mobiel.

**Skill:** used the Redesign skill.
