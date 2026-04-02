## Blog & SEO Engine

### Stap 1: Database
- `blog_posts` tabel met: title, slug, content, meta_description, excerpt, featured_image, tags, status (draft/published), published_at, author
- RLS: iedereen kan gepubliceerde posts lezen, admins kunnen alles

### Stap 2: AI Content Generator (Edge Function)
- Edge function `generate-blog-post` die Lovable AI gebruikt
- Genereert SEO-geoptimaliseerde artikelen over 3D-printen
- Menselijke, waardevolle tone — subtiele vermelding van Overweel3D alleen waar relevant

### Stap 3: Blog pagina's
- `/blog` — overzicht van alle gepubliceerde artikelen
- `/blog/:slug` — individueel artikel met JSON-LD structured data
- SEO meta tags per artikel
- Geen link in de hoofdnavigatie (alleen via footer of directe URL)

### Stap 4: Admin Blog Management
- Admin sectie om posts te bekijken, bewerken, publiceren
- "Genereer artikel" knop die de AI edge function aanroept
- Preview voor publicatie

### Niet in scope (nu)
- Chat systeem (later)
- Platen-tracking (later)
- Social media / email funnels (later)