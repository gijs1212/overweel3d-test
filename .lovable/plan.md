## Referral-codes voor admin

Uitbreiding van het bestaande kortingscode-systeem zodat een admin **referral codes** kan aanmaken die gekoppeld zijn aan een e-mailadres. Wanneer een klant een referral code gebruikt bij het bestellen:

1. De klant krijgt de standaard korting (percentage of vast bedrag) op de bestelling.
2. De **eigenaar van de code** (het gekoppelde e-mailadres) ontvangt automatisch een e-mail met een **beloningskorting** — een percentage van het originele bestelbedrag — die zij bij een volgende bestelling kunnen inleveren.

## Wat een admin ziet

In `AdminDiscountCodes` komt er in het "Nieuwe code" formulier:

- Toggle **"Referral code"** (ja/nee).
- Als aan: extra velden
  - **E-mail eigenaar** (verplicht, het adres dat de beloning ontvangt)
  - **Naam eigenaar** (optioneel, voor de mail-aanhef)
  - **Beloningspercentage** (bv. 10 = 10% van het originele bestelbedrag wordt de beloningskorting)

De lijst toont per code een badge "Referral" met eigenaar-email + beloning%.

## Klantflow (`NewOrder`)

Bestaande kortingscode-invoer blijft identiek. Extra: bij het toepassen van een referral code wordt de eigenaar gemarkeerd; bij het bevestigen van de bestelling triggert een edge function die:

1. De originele bestelling ophaalt (subtotaal vóór korting).
2. Beloningsbedrag berekent = `subtotaal × beloningspercentage`.
3. Een **nieuwe persoonlijke kortingscode** aanmaakt in `discount_codes` (type `fixed`, waarde = beloningsbedrag, `max_uses = 1`, verloopt na 90 dagen, gekoppeld aan de eigenaar's e-mail).
4. Een **e-mail** stuurt naar de eigenaar met de code + bedrag + geldigheid via Resend.

De klant zelf krijgt niets extra's — alleen de standaard korting die al bij de code hoort.

## Technische sectie

### Database — migratie op `discount_codes`

Nieuwe kolommen:

- `is_referral boolean not null default false`
- `owner_email text` (nullable, verplicht als `is_referral = true` — via trigger)
- `owner_name text`
- `reward_percentage numeric` (het percentage dat de eigenaar terugkrijgt)
- `parent_code_id uuid references public.discount_codes(id)` (om beloningscodes te koppelen aan de referral waaruit ze zijn ontstaan — voor rapportage)
- `assigned_to_email text` (voor auto-gegenereerde beloningscodes — beperkt gebruik tot dat e-mailadres)

RLS + GRANTs blijven zoals ze zijn (admin-only writes, publieke lookup via bestaand pad).

### Bestellingsflow — trigger

Bestaande `NewOrder` / order-submit logica roept, ná succesvol aanmaken van de order én ná `increment_discount_usage`, een nieuwe edge function aan: `process-referral-reward`.

### Edge function `supabase/functions/process-referral-reward/index.ts`

Input: `{ order_id, discount_code }`.

Stappen (service-role):

1. Haal de order + de gebruikte kortingscode op.
2. Als `is_referral = false` → return no-op.
3. Bereken beloning = `subtotal × reward_percentage / 100`, afgerond op 2 decimalen. Minimum €1, anders skippen.
4. Genereer unieke code `REF-XXXXXX`.
5. Insert nieuwe rij in `discount_codes`:
   - `discount_type = 'fixed'`, `discount_value = beloning`
   - `max_uses = 1`, `expires_at = now() + 90 dagen`
   - `assigned_to_email = owner_email`, `parent_code_id = <referral code id>`
   - `active = true`
6. Verstuur mail via Resend (`RESEND_API_KEY` staat al ingesteld) naar `owner_email`: onderwerp "U heeft een beloning ontvangen van Overweel3D", body met bedrag, code, geldigheidsdatum, formeel u/uw.

CORS + input validatie met zod, verify_jwt = false (wordt server-side aangeroepen), fout-afhandeling volgens de standaard pattern.

### Kortingscode-validatie (bestaand pad)

Bij het toepassen van een code moet, indien `assigned_to_email` is gezet, gecontroleerd worden dat de ingelogde/opgegeven klant-mail overeenkomt. Anders toont de UI "Deze code is persoonlijk en niet geldig voor dit e-mailadres."

### UI-wijzigingen

- `src/pages/AdminDiscountCodes.tsx`: referral-toggle + extra velden, tonen van referral-badge, kolom "Eigenaar" in de lijst, filter "Alleen referral codes".
- `src/pages/NewOrder.tsx` (of waar de kortingscode wordt gevalideerd): extra check op `assigned_to_email`; na order-submit `supabase.functions.invoke('process-referral-reward', ...)`.
- Geen wijzigingen aan admin filament-calculator, prijzen of andere flows.

### Bestanden aangeraakt

- Migratie op `discount_codes` (kolommen + optionele check-trigger).
- Nieuw: `supabase/functions/process-referral-reward/index.ts` + `deno.json`.
- Bewerkt: `src/pages/AdminDiscountCodes.tsx`, `src/pages/NewOrder.tsx`, evt. `src/lib/constants.ts` voor labels.

### Buiten scope

- Meerdere eigenaars per code.
- Automatische uitbetaling in geld (alleen kortingscodes als beloning).
- Referral-dashboard voor de eigenaar (kan later toegevoegd).

## Openstaande vragen

1. **Verloopduur van de beloningscode**: voorstel 90 dagen — akkoord of anders?
2. **Minimum beloningsbedrag**: voorstel €1 (anders wordt geen code aangemaakt) — akkoord?
3. **Moet de referral-korting die de kóper krijgt (standaard percentage/fixed van de code) blijven zoals nu, of moet een referral code puur bedoeld zijn als "geef door en de eigenaar krijgt X%" zonder korting voor de koper?**
