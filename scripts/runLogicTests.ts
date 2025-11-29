import { Suit, Rank, Card, TablePile } from '../types';
import { getHandValue, getTableValue, canCapture, performBuild, canTrotta, performTrotta } from '../services/gameLogic';

// Helper to make a card
const card = (s: Suit, r: Rank, idSuffix: string): Card => ({ id: `${s}-${r}-${idSuffix}`, suit: s, rank: r, isRed: s === Suit.HEARTS || s === Suit.DIAMONDS });
const singlePile = (c: Card): TablePile => ({ id: `pile-${c.id}`, cards: [c], isBuild: false });
const twoPile = (c1: Card, c2: Card): TablePile => ({ id: `pile-${c1.id}-${c2.id}`, cards: [c1,c2], isBuild: false });

let passed = 0; let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); console.log(`✅ ${name}`); passed++; } catch(e:any){ console.error(`❌ ${name}:`, e.message); failed++; } };
const assert = (cond: any, msg: string) => { if(!cond) throw new Error(msg); };

// 1. Special card cannot capture loose Ace + King
 test('Ace (hand 14) cannot capture loose Ace+King', () => {
   const aceHand = card(Suit.SPADES, Rank.ACE, 'h');
   const aceTable = singlePile(card(Suit.HEARTS, Rank.ACE, 't1'));
   const kingTable = singlePile(card(Suit.CLUBS, Rank.KING, 't2'));
   const can = canCapture(aceHand, [aceTable, kingTable]);
   assert(!can, 'Ace incorrectly allowed to capture Ace+King without build');
 });

// 2. Identical card scenario would be enforced in UI (logic restricts special combos). Here we just ensure standard capture works when identical only
 test('Identical normal card capture allowed', () => {
   const nineHand = card(Suit.DIAMONDS, Rank.NINE, 'h');
   const nineTable = singlePile(card(Suit.DIAMONDS, Rank.NINE, 't'));
   const can = canCapture(nineHand, [nineTable]);
   assert(can, 'Identical card should be capturable');
 });

// 3. Build absorption: build 7 using 3 + 4 pulls in direct 7 single
 test('Build absorption pulls direct match single', () => {
   const hand4 = card(Suit.HEARTS, Rank.FOUR, 'h4');
   const pile3 = singlePile(card(Suit.CLUBS, Rank.THREE, 'p3'));
   const pile7 = singlePile(card(Suit.SPADES, Rank.SEVEN, 'p7'));
   const table: TablePile[] = [pile3, pile7];
   const { newPile, absorbedPileIds } = performBuild(hand4, [pile3], table, 7, 'player');
   assert(newPile.buildValue === 7, 'Build value should be 7');
   assert(absorbedPileIds.includes(pile7.id), 'Direct 7 pile should be absorbed');
 });

// 4. Trotta consolidates singles + two-card pile + pair summing value
 test('Trotta consolidates eligible piles', () => {
   const hand4 = card(Suit.SPADES, Rank.FOUR, 'h4');
   const fourHeart = singlePile(card(Suit.HEARTS, Rank.FOUR, 'fh'));
   const twoClub = singlePile(card(Suit.CLUBS, Rank.TWO, 'c2'));
   const twoDiamond = singlePile(card(Suit.DIAMONDS, Rank.TWO, 'd2'));
   const aceHeart = card(Suit.HEARTS, Rank.ACE, 'ah'); // table value 1
   const threeClub = card(Suit.CLUBS, Rank.THREE, 'c3');
   const threePlusAce = twoPile(threeClub, aceHeart); // sum 3+1=4
   const table: TablePile[] = [fourHeart, twoClub, twoDiamond, threePlusAce];
   const consolidatable = canTrotta(hand4, table);
   // Expect at least four piles (4, 3+Ace, 2,2)
   assert(consolidatable.length >= 4, `Expected >=4 consolidatable piles, got ${consolidatable.length}`);
   const trottaBuild = performTrotta(hand4, consolidatable, 'player');
   assert(trottaBuild.isLocked, 'Trotta build must be locked');
   assert(trottaBuild.cards.length === consolidatable.reduce((s,p)=>s+p.cards.length,1), 'Card count mismatch after trotta');
 });

// 5. Hand/Table value correctness
 test('Value calculators: Ace hand 14, Ace table 1', () => {
   const ace = card(Suit.HEARTS, Rank.ACE, 'v');
   assert(getHandValue(ace) === 14, 'Ace hand value should be 14');
   assert(getTableValue(ace) === 1, 'Ace table value should be 1');
 });

console.log(`\n--- Test Summary ---\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) process.exit(1);
