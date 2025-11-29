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

## Kör Lokalt

**Krav:** Node.js

1. Installera beroenden:
   `npm install`
2. Kör appen:
   `npm run dev`
