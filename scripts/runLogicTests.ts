import { Suit, Rank, Card, TablePile } from '../types';
import { getHandValue, getTableValue, canCapture, performBuild, canTrotta, performTrotta, findBestMove, calculateTableMulleTabbar, performCapture, findDiscardAbsorption } from '../services/gameLogic';


// Helper to make a card
const card = (s: Suit, r: Rank, idSuffix: string): Card => ({ id: `${s}-${r}-${idSuffix}`, suit: s, rank: r, isRed: s === Suit.HEARTS || s === Suit.DIAMONDS });
const singlePile = (c: Card): TablePile => ({ id: `pile-${c.id}`, cards: [c], isBuild: false });
const twoPile = (c1: Card, c2: Card): TablePile => ({ id: `pile-${c1.id}-${c2.id}`, cards: [c1,c2], isBuild: false });

let passed = 0; let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); console.log(`✅ ${name}`); passed++; } catch(e:any){ console.error(`❌ ${name}:`, e.message); failed++; } };
const assert = (cond: any, msg: string) => { if(!cond) throw new Error(msg); };

// Table-mulle tabbar tests
test('2 Aces from table = 1 tabbe', () => {
  const aceH = card(Suit.HEARTS, Rank.ACE, 'ah');
  const aceC = card(Suit.HEARTS, Rank.ACE, 'ac'); // Same suit for mulle
  const tabbar = calculateTableMulleTabbar([aceH, aceC]);
  assert(tabbar === 1, `Expected 1 tabbe for 2 table aces, got ${tabbar}`);
});

test('2 Spader 2 from table = 2 tabbar', () => {
  const sp2a = card(Suit.SPADES, Rank.TWO, 's2a');
  const sp2b = card(Suit.SPADES, Rank.TWO, 's2b');
  const tabbar = calculateTableMulleTabbar([sp2a, sp2b]);
  assert(tabbar === 2, `Expected 2 tabbar for 2 Spader 2s, got ${tabbar}`);
});

test('2 Ruter 10 from table = 10 tabbar', () => {
  const ru10a = card(Suit.DIAMONDS, Rank.TEN, 'r10a');
  const ru10b = card(Suit.DIAMONDS, Rank.TEN, 'r10b');
  const tabbar = calculateTableMulleTabbar([ru10a, ru10b]);
  assert(tabbar === 10, `Expected 10 tabbar for 2 Ruter 10s, got ${tabbar}`);
});

test('Normal pair (e.g. 2 nines) = 0 tabbar', () => {
  const nine1 = card(Suit.HEARTS, Rank.NINE, 'n1');
  const nine2 = card(Suit.HEARTS, Rank.NINE, 'n2');
  const tabbar = calculateTableMulleTabbar([nine1, nine2]);
  assert(tabbar === 0, `Normal pairs should not generate tabbar, got ${tabbar}`);
});

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

// 3b. Build 14 should NOT absorb separate 10 and 4 singles
test('Build 14 does NOT absorb 10 + 4 singles', () => {
  const handK = card(Suit.SPADES, Rank.KING, 'hk'); // table value 13
  const pileA = singlePile(card(Suit.HEARTS, Rank.ACE, 'pa')); // value 1
  const pile10 = singlePile(card(Suit.DIAMONDS, Rank.TEN, 'p10')); // value 10
  const pile4 = singlePile(card(Suit.HEARTS, Rank.FOUR, 'p4')); // value 4
  const table: TablePile[] = [pileA, pile10, pile4];
  const { absorbedPileIds } = performBuild(handK, [pileA], table, 14, 'player');
  // Should not absorb 10 or 4 because they are separate singles
  assert(!absorbedPileIds.includes(pile10.id) && !absorbedPileIds.includes(pile4.id), '10 and 4 singles should not be absorbed into 14 build');
});

// Scenario 2: Capture expansion with single combos
test('Capture 7 pulls in 2+5 singles combo', () => {
  const hand7 = card(Suit.HEARTS, Rank.SEVEN, 'h7');
  const pile7 = singlePile(card(Suit.SPADES, Rank.SEVEN, 'p7'));
  const pile2 = singlePile(card(Suit.CLUBS, Rank.TWO, 'p2'));
  const pile5 = singlePile(card(Suit.DIAMONDS, Rank.FIVE, 'p5'));
  const table: TablePile[] = [pile7, pile2, pile5];
  
  const { allCapturedPiles } = performCapture(hand7, [pile7], table);
  
  // Should capture pile7 + combo of 2+5
  assert(allCapturedPiles.length === 3, `Expected 3 piles captured (7, 2, 5), got ${allCapturedPiles.length}`);
  const capturedIds = allCapturedPiles.map(p => p.id);
  assert(capturedIds.includes(pile7.id) && capturedIds.includes(pile2.id) && capturedIds.includes(pile5.id), 'Should capture 7 single and 2+5 combo');
});

// Scenario 3: Discard absorption when discard+single=buildValue
test('Discard 6 + table 1 absorbs into build 7', () => {
  const discard6 = card(Suit.HEARTS, Rank.SIX, 'd6');
  const build7: TablePile = {
    id: 'build7',
    cards: [card(Suit.SPADES, Rank.THREE, 'b3'), card(Suit.CLUBS, Rank.FOUR, 'b4')],
    isBuild: true,
    buildValue: 7,
    owner: 'opponent'
  };
  const pileAce = singlePile(card(Suit.DIAMONDS, Rank.ACE, 'pa')); // value 1
  const table: TablePile[] = [build7, pileAce];
  
  const absorption = findDiscardAbsorption(discard6, table);
  
  assert(absorption !== null, 'Should detect absorption');
  assert(absorption!.build.id === build7.id, 'Should target build 7');
  assert(absorption!.single.id === pileAce.id, 'Should absorb ace single');
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
// Extra: scenario from user report - 4-build + 5-build with hand 9 should NOT capture both
test('Cannot capture 4-build + 5-build with 9', () => {
  const b4: TablePile = { id: 'b4', isBuild: true, buildValue: 4, owner: 'opponent', isLocked: true, cards: [card(Suit.SPADES, Rank.TWO, 'x1'), card(Suit.HEARTS, Rank.TWO, 'x2')] };
  const b5: TablePile = { id: 'b5', isBuild: true, buildValue: 5, owner: 'player', isLocked: true, cards: [card(Suit.DIAMONDS, Rank.TWO, 'y1'), card(Suit.CLUBS, Rank.THREE, 'y2')] };
  const nine = card(Suit.HEARTS, Rank.NINE, 'h9');
  // Direct validation
  assert(!canCapture(nine, [b4, b5]), 'Validation should reject capturing 2 builds together');
  // AI should not propose capturing both
  const move = findBestMove([nine], [b4, b5]);
  assert(move.type !== 'capture', 'AI should not attempt to capture 4+5 builds with 9');
});

// AI: With own build, prefer feed-discard
test('AI with own 7-build prefers capture or feed-discard', () => {
  const build7: TablePile = { id: 'b7', isBuild: true, buildValue: 7, owner: 'opponent', isLocked: false, cards: [card(Suit.CLUBS, Rank.THREE, 'b7c3'), card(Suit.HEARTS, Rank.FOUR, 'b7h4')] };
  const table: TablePile[] = [build7];
  const hand = [card(Suit.DIAMONDS, Rank.SEVEN, 'h7'), card(Suit.SPADES, Rank.TWO, 'h2')];
  const move = findBestMove(hand, table);
  // Should either capture its own build with 7 or discard 7 to feed
  const ok = (move.type === 'capture' && move.pileIds.includes('b7')) || (move.type === 'discard' && move.cardId.includes('h7')) || (move.type === 'trotta' && move.pileIds.includes('b7'));
  assert(ok, `Expected capture b7 or discard h7 to feed, got ${JSON.stringify(move)}`);
});
