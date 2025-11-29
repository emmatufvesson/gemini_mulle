<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Mulle — Regler och Körning

Denna app implementerar kortspelet Mulle för två spelare.

## Centrala Regler (utdrag)

- Specialvärden i hand: A=14, SP 2=15, RU 10=16. På bordet: A=1, övriga nominellt.
- Capture: Matcha handvärde mot bordets värden. Special (14/15/16) får endast ta byggen eller identiskt kort.
- Identiskt kort: Finns exakt ett identiskt kort på bordet måste du ta det (mulle).
- Build: Kräver reservationskort; vid skapande/ombyggnad kan högar med exakt byggvärde absorberas. Absorption låser.
- Trotta: Konsoliderar alla kort/strukturer som bildar värdet till ett låst bygge.
- Feed: Släppt kort med samma bordvärde som eget bygge läggs automatiskt till bygget och låser det.
- Bordmulle-tabbar: Två identiska bordkort som tas in samtidigt ger tabbar istället för mullepoäng: 2×Ess=1 tabbe, 2×SP 2=2 tabbar, 2×RU 10=10 tabbar.
- Discard-begränsning: Om du har byggen på bordet får du inte släppa kort till bordet. Tillåtna drag då är: Capture, Build (skapa/bygga om), Trotta. Discard är endast tillåten om kortet kan feedas in i ett eget bygge.

### Omedelbart Intag (Ny regel)

Alla byggen och tröttor måste tas in samma runda som de skapas. Ett bygge eller en trotta får därför endast utföras om du (eller AI) har ett separat handkort vars handvärde exakt motsvarar byggvärdet/trottavärdet.

Flöde:
1. Spelaren väljer kort + högar och skapar bygge (eller gör trotta).
2. Systemet verifierar att ett annat handkort kan ta in värdet direkt (reservation ≠ byggkortet).
3. Bygget/tröttan skapas (med eventuell absorption/konsolidation) och låses vid absorption eller trotta.
4. Omedelbar capture sker med reservationskortet. Under capture dras automatiskt in ALLA singelkortskombinationer som summerar till värdet (expansion).

Misslyckas steg 2 (inget fångstkort) aborteras bygg/trotta — knappen är avstängd i UI så detta ska aldrig ske praktiskt.

### Tre Absorptionsscenarier

1. Bygge skapas: Alla singlar och 2‑kortshögar med exakt byggvärde absorberas (låser bygget).
2. Bygge/trotta tas in: Alla singelkortskombinationer (valfri storlek) som summerar till handkortets värde dras in utöver valda högar.
3. Motståndares (eller din) discard: Om släppt kort + ett singelkort på bordet tillsammans bildar exakt värdet av ett befintligt bygge absorberas båda omedelbart in och bygget låses.

### Trotta Omfattning

Trotta kan göras på:
- Singelkort med exakt värde.
- 2‑kortshögar vars summa = värdet.
- Kombination av ett singelkort + en 2‑kortshög (om deras sum = värdet).
- Två singlar som tillsammans = värdet.

Efter trotta gäller samma omedelbara intag med separat fångstkort som för vanliga byggen.

## Kör Lokalt

**Krav:** Node.js

1. Installera beroenden:
   `npm install`
2. Kör appen:
   `npm run dev`
