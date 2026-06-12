## Doel

Eén bestelling kan nu meerdere typen items bevatten (downloadlink, geüpload bestand, kant-en-klaar, custom). De admin kan altijd bestanden uploaden bij een bestelling en kan ook een upload-verzoek aan de klant sturen — pas dán ziet de klant de upload-knop in zijn orderdetail. Daarnaast komt het kortingscode-veld op de juiste plek in `NewOrder.tsx` en wordt er een lichte STL/OBJ viewer toegevoegd.

## 1. Eén winkelmandje voor alle besteltypes (NewOrder.tsx)

- Vervang de huidige "uploadMode"-radio (link / file / custom / prebuilt) door 4 panelen die naast elkaar gebruikt kunnen worden, elk met een "Toevoegen aan winkelmandje" knop.
- Introduceer één state `cart: CartLine[]` met een discriminated union:
  ```ts
  type CartLine =
    | { kind: "file"; file: File; material; color; quantity; estimatedGrams?; ... }
    | { kind: "link"; url; material; color; quantity }
    | { kind: "prebuilt"; productId; name; material; color; quantity; price; customText? }
    | { kind: "custom"; description; photos: File[] }
  ```
- Rechterkolom toont altijd één samengevoegd winkelmandje met per regel het type-icoon, beschrijving, prijs/indicatie en verwijderknop. Totaal = som van prebuilt-prijzen + indicatieprijs van file-regels (link/custom = "op offerte").
- `handleSubmit` verwerkt alle types in één order: upload alle `file`-regels naar storage + `order_files`, neem `link`-regels en custom-foto's op in `file_links`/notes, en sla prebuilt-regels op zoals nu. `order_method` wordt `"mixed"` als er meerdere types zijn.

## 2. Kortingscode bij gegevens-stap

- Haal de discount-state + `applyDiscountCode` logica uit `Bestellen.tsx` over naar `NewOrder.tsx`.
- Render het kortingscode-veld binnen stap 2 (gegevens) direct boven de prijsoverzicht-kaart, zoals gewenst.
- Pas totaalweergave en `handleSubmit` aan: korting toepassen op alle prijsdragende regels, `increment_discount_usage` aanroepen, korting meesturen naar de mail-functie.

## 3. Admin file-uploads + upload-verzoek aan klant

Database (migratie):
- Voeg op `orders` toe:
  - `customer_upload_requested boolean default false`
  - `customer_upload_request_note text`
  - `customer_upload_requested_at timestamptz`
- Pas RLS op `order_files` aan zodat de eigenaar van een order ook bestanden mag uploaden wanneer `customer_upload_requested = true` (toevoegen aan bestaande insert-policy via OR-conditie). Admin-insert blijft altijd toegestaan.

Admin (`AdminOrderEdit.tsx`):
- Sectie "Bestanden" krijgt:
  - Altijd zichtbare upload-knop (admin upload).
  - Knop "Upload-verzoek naar klant sturen" met optionele notitie → zet de drie nieuwe kolommen en triggert `send-order-email` met een nieuw type `customer_upload_request` (klant krijgt mail met link naar orderdetail).
  - Knop "Verzoek annuleren" om het verzoek te resetten.

Klant (`OrderDetail.tsx`):
- Toon de upload-zone alleen als `customer_upload_requested === true`. Tekstkop: "De admin heeft u gevraagd bestanden te uploaden" + de notitie. Na upload blijft de zone zichtbaar voor extra bestanden tot admin het verzoek sluit.

Edge function:
- Breid `send-order-email/index.ts` uit met een case `customer_upload_request` (eenvoudige Resend-mail met orderlink en notitie).

## 4. STL/OBJ viewer (onderzoek + implementatie)

Onderzoek samengevat:
- Lichtste optie zonder zware afhankelijkheden: `three` + handmatige `STLLoader`/`OBJLoader` uit `three/examples/jsm/loaders/...`. Werkt voor STL (binair + ascii) en OBJ. Bundel-impact ~150 kB gzip.
- Voor 3MF bestaat `3MFLoader` in dezelfde set, maar Bambu-bestanden bevatten vaak meerdere objecten — voor nu alleen STL/OBJ tonen, 3MF blijft fallback "geen preview".
- Geen React-three-fiber nodig; één klein component met `useEffect` dat een renderer in een `<canvas>` opzet, het geladen geometry centreert en een `OrbitControls`-achtige eenvoudige rotatie biedt (alleen muis-drag voor rotatie + scroll voor zoom).

Implementatie:
- Nieuw component `src/components/ModelViewer.tsx` dat een `File` of een storage-pad (signed URL) accepteert en het model rendert in een 300px-vierkant canvas. Bij onbekend/3MF/STEP toont het een placeholder met bestandsicoon.
- Toon de viewer:
  - In `NewOrder.tsx` naast elke `file`-regel in het winkelmandje.
  - In `OrderDetail.tsx` en `AdminOrderEdit.tsx` per `order_files`-record (lazy mount, alleen als extensie .stl/.obj).
- Voeg `three` toe via `bun add three @types/three`.

## 5. Errors / opruiming

- Verwijder de niet-werkende `useState(() => { ... })` (moet `useEffect`) in `NewOrder.tsx` regel 102.
- Verwijder de ongebruikte `src/pages/Bestellen.tsx` (route gebruikt `NewOrder.tsx`).
- Loop het bestand na op imports die door de cart-refactor wegvallen.

## Bestanden (verwacht)

- migratie: 3 kolommen op `orders` + policy-update op `order_files`
- `src/pages/NewOrder.tsx` (refactor: cart + discount + viewer)
- `src/components/ModelViewer.tsx` (nieuw)
- `src/pages/AdminOrderEdit.tsx` (upload-verzoek knoppen + viewer)
- `src/pages/OrderDetail.tsx` (conditional upload-zone + viewer)
- `supabase/functions/send-order-email/index.ts` (nieuwe mailcase)
- verwijder `src/pages/Bestellen.tsx`
- `package.json` (three)
