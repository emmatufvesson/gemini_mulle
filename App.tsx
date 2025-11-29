import React, { useState, useEffect, useReducer } from 'react';
import { GameState, Card, TablePile, PlayerState, GameLog, Suit, Rank } from './types';
import { createDeck, getHandValue, getPileValue, getMullePoints, updatePlayerScore, canCapture, findBestMove, getTableValue, canBuild, calculateMulleScore, performBuild, canTrotta, performTrotta, findFeedTarget, performFeed, findIdenticalCard, calculateTableMulleTabbar, performCapture, findDiscardAbsorption, findCaptureCardForValue } from './services/gameLogic';
import { INITIAL_TABLE_SIZE, HAND_SIZE, TOTAL_ROUNDS } from './constants';
import CardComponent from './components/CardComponent';

// --- Reducer for complex state logic ---

type Action = 
  | { type: 'INIT_GAME' }
  | { type: 'DEAL_CARDS' }
  | { type: 'SELECT_HAND_CARD', cardId: string }
  | { type: 'TOGGLE_TABLE_PILE', pileId: string }
  | { type: 'PLAYER_MOVE', moveType: 'capture' | 'discard' | 'build' | 'trotta', playedCardId: string, targetPileIds: string[], buildDirection?: 'up' | 'down' }
  | { type: 'OPPONENT_MOVE' }
  | { type: 'END_ROUND' }
  | { type: 'LOG', message: string };

const initialPlayerState: PlayerState = {
  hand: [],
  captured: [],
  mulles: 0,
  tabbes: 0,
  score: { mullePoints: 0, tabbePoints: 0, intakePoints: 0, bonus: 0, total: 0 }
};

const initialState: GameState = {
  deck: [],
  table: [],
  player: initialPlayerState,
  opponent: initialPlayerState,
  turn: 'player',
  round: 1,
  lastCapturer: null,
  logs: [],
  gameOver: false,
  selectedHandCardId: null,
  selectedTablePileIds: [],
};

const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'INIT_GAME': {
      const newDeck = createDeck();
      const tableCards = newDeck.splice(0, INITIAL_TABLE_SIZE);
      const playerHand = newDeck.splice(0, HAND_SIZE);
      const opponentHand = newDeck.splice(0, HAND_SIZE);

      const tablePiles: TablePile[] = tableCards.map(c => ({
        id: `pile-${c.id}`,
        cards: [c],
        isBuild: false
      }));

      return {
        ...initialState,
        deck: newDeck,
        table: tablePiles,
        player: { ...initialPlayerState, hand: playerHand },
        opponent: { ...initialPlayerState, hand: opponentHand },
        logs: [{ id: Date.now().toString(), message: "Game Started. Good Luck!", type: 'info' }]
      };
    }

    case 'DEAL_CARDS': {
      if (state.deck.length === 0) return state; 

      const pHand = [...state.player.hand, ...state.deck.slice(0, HAND_SIZE)];
      const oHand = [...state.opponent.hand, ...state.deck.slice(HAND_SIZE, HAND_SIZE * 2)];
      const remainingDeck = state.deck.slice(HAND_SIZE * 2);

      return {
        ...state,
        deck: remainingDeck,
        player: { ...state.player, hand: pHand },
        opponent: { ...state.opponent, hand: oHand },
        logs: [...state.logs, { id: Date.now().toString(), message: "New hands dealt.", type: 'info' }]
      };
    }

    case 'SELECT_HAND_CARD':
      return { ...state, selectedHandCardId: action.cardId };

    case 'TOGGLE_TABLE_PILE': {
      const isSelected = state.selectedTablePileIds.includes(action.pileId);
      const newSelected = isSelected
        ? state.selectedTablePileIds.filter(id => id !== action.pileId)
        : [...state.selectedTablePileIds, action.pileId];
      return { ...state, selectedTablePileIds: newSelected };
    }

    case 'PLAYER_MOVE': {
      const { moveType, playedCardId, targetPileIds } = action;
      const playedCard = state.player.hand.find(c => c.id === playedCardId);
      if (!playedCard) return state;

      let newTable = [...state.table];
      let newPlayer = { ...state.player };
      let newLogs = [...state.logs];
      let lastCapturer = state.lastCapturer;

      // Remove played card from hand
      newPlayer.hand = newPlayer.hand.filter(c => c.id !== playedCardId);

      if (moveType === 'capture') {
        const capturedPiles = state.table.filter(p => targetPileIds.includes(p.id));
        
        // Use performCapture to auto-expand with single combos
        const { allCapturedPiles } = performCapture(playedCard, capturedPiles, state.table);
        
        let allInvolvedCards: Card[] = [playedCard];
        let tabbePoints = 0;

        allCapturedPiles.forEach(p => {
          allInvolvedCards = [...allInvolvedCards, ...p.cards];
        });

        // Extract table cards only (everything except played card from hand)
        const tableOnlyCards = allInvolvedCards.slice(1);
        
        // Check for table-mulle tabbar (2 aces, 2 Sp2s, 2 Ru10s from table)
        const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
        if (tableMulleTabbar > 0) {
          tabbePoints += tableMulleTabbar;
          newLogs.push({ id: Date.now().toString() + 'tmt', message: `Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' });
        }

        // Calculate normal Mulle points (including hand card)
        const mullePts = calculateMulleScore(allInvolvedCards);
        if (mullePts > 0) {
            newLogs.push({ id: Date.now().toString() + 'pm', message: `MULLE! +${mullePts} points`, type: 'alert' });
        }

        newPlayer.captured = [...newPlayer.captured, ...allInvolvedCards];
        newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));

        if (newTable.length === 0) {
          tabbePoints += 1;
          newLogs.push({ id: Date.now() + 't', message: "TABBE! +1 point", type: 'alert' });
        }

        newPlayer.score.mullePoints += mullePts;
        newPlayer.score.tabbePoints += tabbePoints;
        newPlayer = updatePlayerScore(newPlayer);
        lastCapturer = 'player';
        
        const extraCount = allCapturedPiles.length - capturedPiles.length;
        const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
        newLogs.push({ id: Date.now() + 'c', message: `You captured ${allInvolvedCards.length - 1} cards${extraMsg}.`, type: 'action' });      } else if (moveType === 'discard') {
                // Check absorption first, then feed
                const absorption = findDiscardAbsorption(playedCard, state.table);
        
                if (absorption) {
                    // Merge discard + single into the build and lock it
                    const { build, single } = absorption;
                    const updatedBuild: TablePile = {
                        ...build,
                        cards: [...build.cards, playedCard, single.cards[0]],
                        isLocked: true
                    };
          
                    newTable = newTable.filter(p => p.id !== build.id && p.id !== single.id);
                    newTable.push(updatedBuild);
                    newLogs.push({ id: Date.now() + 'a', message: `Your discard absorbed into build ${build.buildValue}.`, type: 'action' });
                } else {
                    const feedTarget = findFeedTarget(playedCard, state.table, 'player');
                    if (feedTarget) {
                        const updatedBuild = performFeed(playedCard, feedTarget);
                        newTable = newTable.map(p => p.id === feedTarget.id ? updatedBuild : p);
                        newLogs.push({ id: Date.now() + 'f', message: `Fed ${playedCard.suit} ${playedCard.rank} to build (locked).`, type: 'action' });
                    } else {
                        newTable.push({
                            id: `pile-${playedCard.id}`,
                            cards: [playedCard],
                            isBuild: false
                        });
                        newLogs.push({ id: Date.now() + 'd', message: `You discarded ${playedCard.suit} ${playedCard.rank}.`, type: 'info' });
                    }
                }
      } else if (moveType === 'build') {
        // Build with absorption
        const selectedPiles = state.table.filter(p => targetPileIds.includes(p.id));
        const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
        const buildValue = pilesSum + getTableValue(playedCard);
        
        const { newPile, absorbedPileIds, isLocked } = performBuild(
          playedCard,
          selectedPiles,
          state.table,
          buildValue,
          'player'
        );
        
        // Remove selected and absorbed piles
        newTable = newTable.filter(p => !targetPileIds.includes(p.id) && !absorbedPileIds.includes(p.id));
        newTable.push(newPile);
        
        const absorbedCount = absorbedPileIds.length;
        const lockMsg = isLocked ? ' (locked)' : '';
        const absorbMsg = absorbedCount > 0 ? ` +${absorbedCount} absorbed` : '';
                newLogs.push({ id: Date.now() + 'pb', message: `You built ${buildValue}${absorbMsg}${lockMsg}.`, type: 'info' });

                // Immediate capture requirement
                const captureCard = findCaptureCardForValue(newPlayer.hand, buildValue);
                if (!captureCard) {
                    newLogs.push({ id: Date.now() + 'errb', message: `Rule: Build must be taken same turn but no capture card found. Build cancelled.`, type: 'alert' });
                    // Rollback: remove build and restore absorbed piles (simplified: abort move)
                    return state; // Should never happen due to button disable
                }

                // Remove capture card from hand
                newPlayer.hand = newPlayer.hand.filter(c => c.id !== captureCard.id);

                // Perform capture expansion (includes single combos)
                const { allCapturedPiles } = performCapture(captureCard, [newPile], newTable);
                let allInvolvedCards: Card[] = [captureCard];
                allCapturedPiles.forEach(p => allInvolvedCards.push(...p.cards));

                // Table-only cards for tabbar
                const tableOnlyCards = allInvolvedCards.slice(1);
                const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
                let tabbePoints = 0;
                if (tableMulleTabbar > 0) {
                    tabbePoints += tableMulleTabbar;
                    newLogs.push({ id: Date.now() + 'tmbc', message: `Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' });
                }
                const mullePts = calculateMulleScore(allInvolvedCards);
                if (mullePts > 0) newLogs.push({ id: Date.now() + 'mbc', message: `MULLE! +${mullePts} points`, type: 'alert' });

                newPlayer.captured = [...newPlayer.captured, ...allInvolvedCards];
                newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));
                if (newTable.length === 0) { tabbePoints += 1; newLogs.push({ id: Date.now() + 'tbc', message: 'TABBE! +1 point', type: 'alert' }); }
                newPlayer.score.mullePoints += mullePts;
                newPlayer.score.tabbePoints += tabbePoints;
                newPlayer = updatePlayerScore(newPlayer);
                lastCapturer = 'player';
                const extraCount = allCapturedPiles.length - 1;
                const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
                newLogs.push({ id: Date.now() + 'cbc', message: `Build captured immediately with ${captureCard.rank}${extraMsg}.`, type: 'action' });
      } else if (moveType === 'trotta') {
        // Trotta with automatic consolidation
        const consolidatable = canTrotta(playedCard, state.table);
        const trottaBuild = performTrotta(playedCard, consolidatable, 'player');
        
        newTable = newTable.filter(p => !consolidatable.some(c => c.id === p.id));
        newTable.push(trottaBuild);
        
                newLogs.push({ id: Date.now() + 'ptr', message: `You tröttade ${trottaBuild.buildValue} (${trottaBuild.cards.length} cards, locked).`, type: 'action' });

                // Immediate capture requirement for trotta
                const captureCard = findCaptureCardForValue(newPlayer.hand, trottaBuild.buildValue, playedCard.id);
                if (!captureCard) {
                    newLogs.push({ id: Date.now() + 'errt', message: `Rule: Trotta must be taken same turn but no capture card found.`, type: 'alert' });
                    return state; // Should not happen due to button disable
                }
                newPlayer.hand = newPlayer.hand.filter(c => c.id !== captureCard.id);
                const { allCapturedPiles } = performCapture(captureCard, [trottaBuild], newTable);
                let allInvolvedCards: Card[] = [captureCard];
                allCapturedPiles.forEach(p => allInvolvedCards.push(...p.cards));
                const tableOnlyCards = allInvolvedCards.slice(1);
                const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
                let tabbePoints = 0;
                if (tableMulleTabbar > 0) { tabbePoints += tableMulleTabbar; newLogs.push({ id: Date.now() + 'tmtt', message: `Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' }); }
                const mullePts = calculateMulleScore(allInvolvedCards);
                if (mullePts > 0) newLogs.push({ id: Date.now() + 'mtt', message: `MULLE! +${mullePts} points`, type: 'alert' });
                newPlayer.captured = [...newPlayer.captured, ...allInvolvedCards];
                newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));
                if (newTable.length === 0) { tabbePoints += 1; newLogs.push({ id: Date.now() + 'tabt', message: 'TABBE! +1 point', type: 'alert' }); }
                newPlayer.score.mullePoints += mullePts; newPlayer.score.tabbePoints += tabbePoints; newPlayer = updatePlayerScore(newPlayer); lastCapturer = 'player';
                const extraCount = allCapturedPiles.length - 1; const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
                newLogs.push({ id: Date.now() + 'ctt', message: `Trotta captured immediately with ${captureCard.rank}${extraMsg}.`, type: 'action' });
      }

      return {
        ...state,
        table: newTable,
        player: newPlayer,
        logs: newLogs,
        turn: 'opponent',
        lastCapturer,
        selectedHandCardId: null,
        selectedTablePileIds: []
      };
    }

    case 'OPPONENT_MOVE': {
      const aiHand = state.opponent.hand;
      if (aiHand.length === 0) return state;

      const move = findBestMove(aiHand, state.table);
      const playedCard = aiHand.find(c => c.id === move.cardId)!;
      
      let newTable = [...state.table];
      let newOpponent = { ...state.opponent };
      let newLogs = [...state.logs];
      let lastCapturer = state.lastCapturer;

      newOpponent.hand = newOpponent.hand.filter(c => c.id !== playedCard.id);

      if (move.type === 'capture') {
         const capturedPiles = state.table.filter(p => move.pileIds.includes(p.id));
         
         // Use performCapture to auto-expand with single combos
         const { allCapturedPiles } = performCapture(playedCard, capturedPiles, state.table);
         
         let allInvolvedCards: Card[] = [playedCard];
         let tabbePoints = 0;

         allCapturedPiles.forEach(p => {
            allInvolvedCards = [...allInvolvedCards, ...p.cards];
         });

         // Extract table cards only (everything except played card from hand)
         const tableOnlyCards = allInvolvedCards.slice(1);
         
         // Check for table-mulle tabbar
         const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
         if (tableMulleTabbar > 0) {
             tabbePoints += tableMulleTabbar;
             newLogs.push({ id: Date.now() + 'otmt', message: `Opponent Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' });
         }

         const mullePts = calculateMulleScore(allInvolvedCards);
         if (mullePts > 0) {
             newLogs.push({ id: Date.now() + 'om', message: `Opponent Mulle! +${mullePts} pts`, type: 'alert' });
         }

         newOpponent.captured = [...newOpponent.captured, ...allInvolvedCards];
         newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));

         if (newTable.length === 0) {
             tabbePoints += 1;
             newLogs.push({ id: Date.now() + 'ot', message: "Opponent scored a Tabbe!", type: 'alert' });
         }

         newOpponent.score.mullePoints += mullePts;
         newOpponent.score.tabbePoints += tabbePoints;
         newOpponent = updatePlayerScore(newOpponent);
         lastCapturer = 'opponent';
         
         const extraCount = allCapturedPiles.length - capturedPiles.length;
         const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
         newLogs.push({ id: Date.now() + 'oc', message: `Opponent captured ${allInvolvedCards.length - 1} cards${extraMsg}.`, type: 'info' });

      } else if (move.type === 'build') {
                 // Build with absorption
                 const selectedPiles = state.table.filter(p => move.pileIds.includes(p.id));
         
                 const { newPile, absorbedPileIds, isLocked } = performBuild(
                     playedCard,
                     selectedPiles,
                     state.table,
                     move.buildValue!,
                     'opponent'
                 );
         
                 newTable = newTable.filter(p => !move.pileIds.includes(p.id) && !absorbedPileIds.includes(p.id));
                 newTable.push(newPile);
         
                 const lockMsg = isLocked ? ' (locked)' : '';
                 newLogs.push({ id: Date.now() + 'ob', message: `Opponent built ${move.buildValue}${lockMsg}.`, type: 'info' });

                 // Immediate capture chain
                 const captureCard = findCaptureCardForValue(newOpponent.hand, move.buildValue!, playedCard.id);
                 if (captureCard) {
                     newOpponent.hand = newOpponent.hand.filter(c => c.id !== captureCard.id);
                     const { allCapturedPiles } = performCapture(captureCard, [newPile], newTable);
                     let allInvolvedCards: Card[] = [captureCard];
                     allCapturedPiles.forEach(p => allInvolvedCards.push(...p.cards));
                     const tableOnlyCards = allInvolvedCards.slice(1);
                     let tabbePoints = 0;
                     const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
                     if (tableMulleTabbar > 0) { tabbePoints += tableMulleTabbar; newLogs.push({ id: Date.now() + 'otmb', message: `Opponent Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' }); }
                     const mullePts = calculateMulleScore(allInvolvedCards);
                     if (mullePts > 0) newLogs.push({ id: Date.now() + 'ombc', message: `Opponent Mulle! +${mullePts} pts`, type: 'alert' });
                     newOpponent.captured = [...newOpponent.captured, ...allInvolvedCards];
                     newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));
                     if (newTable.length === 0) { tabbePoints += 1; newLogs.push({ id: Date.now() + 'otbc', message: 'Opponent scored a Tabbe!', type: 'alert' }); }
                     newOpponent.score.mullePoints += mullePts; newOpponent.score.tabbePoints += tabbePoints; newOpponent = updatePlayerScore(newOpponent);
                     lastCapturer = 'opponent';
                     const extraCount = allCapturedPiles.length - 1; const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
                     newLogs.push({ id: Date.now() + 'ocbc', message: `Opponent immediately captured build with ${captureCard.rank}${extraMsg}.`, type: 'info' });
                 }

    } else if (move.type === 'trotta') {
       // Trotta
       const consolidatable = state.table.filter(p => move.pileIds.includes(p.id));
       const trottaBuild = performTrotta(playedCard, consolidatable, 'opponent');
         
       newTable = newTable.filter(p => !move.pileIds.includes(p.id));
       newTable.push(trottaBuild);
         
       newLogs.push({ id: Date.now() + 'otr', message: `Opponent tröttade ${trottaBuild.buildValue}.`, type: 'action' });

       // Immediate capture chain for trotta
       const captureCard = findCaptureCardForValue(newOpponent.hand, trottaBuild.buildValue, playedCard.id);
       if (captureCard) {
           newOpponent.hand = newOpponent.hand.filter(c => c.id !== captureCard.id);
           const { allCapturedPiles } = performCapture(captureCard, [trottaBuild], newTable);
           let allInvolvedCards: Card[] = [captureCard];
           allCapturedPiles.forEach(p => allInvolvedCards.push(...p.cards));
           const tableOnlyCards = allInvolvedCards.slice(1);
           let tabbePoints = 0;
           const tableMulleTabbar = calculateTableMulleTabbar(tableOnlyCards);
           if (tableMulleTabbar > 0) { tabbePoints += tableMulleTabbar; newLogs.push({ id: Date.now() + 'otmt', message: `Opponent Table Mulle! +${tableMulleTabbar} tabbar`, type: 'alert' }); }
           const mullePts = calculateMulleScore(allInvolvedCards);
           if (mullePts > 0) newLogs.push({ id: Date.now() + 'omtt', message: `Opponent Mulle! +${mullePts} pts`, type: 'alert' });
           newOpponent.captured = [...newOpponent.captured, ...allInvolvedCards];
           newTable = newTable.filter(p => !allCapturedPiles.some(cp => cp.id === p.id));
           if (newTable.length === 0) { tabbePoints += 1; newLogs.push({ id: Date.now() + 'ottt', message: 'Opponent scored a Tabbe!', type: 'alert' }); }
           newOpponent.score.mullePoints += mullePts; newOpponent.score.tabbePoints += tabbePoints; newOpponent = updatePlayerScore(newOpponent);
           lastCapturer = 'opponent';
           const extraCount = allCapturedPiles.length - 1; const extraMsg = extraCount > 0 ? ` +${extraCount} combos` : '';
           newLogs.push({ id: Date.now() + 'octt', message: `Opponent immediately captured trotta with ${captureCard.rank}${extraMsg}.`, type: 'info' });
       }

      } else {
                    // Discard - check absorption first, then feed
                    const absorption = findDiscardAbsorption(playedCard, state.table);
                    
                    if (absorption) {
                        // Merge discard + single into the build and lock it
                        const { build, single } = absorption;
                        const updatedBuild: TablePile = {
                            ...build,
                            cards: [...build.cards, playedCard, single.cards[0]],
                            isLocked: true
                        };
                        
                        newTable = newTable.filter(p => p.id !== build.id && p.id !== single.id);
                        newTable.push(updatedBuild);
                        newLogs.push({ id: Date.now() + 'oa', message: `Opponent's discard absorbed into build ${build.buildValue}.`, type: 'action' });
                    } else {
                        const feedTarget = findFeedTarget(playedCard, state.table, 'opponent');
                        if (feedTarget) {
                            const updatedBuild = performFeed(playedCard, feedTarget);
                            newTable = newTable.map(p => p.id === feedTarget.id ? updatedBuild : p);
                            newLogs.push({ id: Date.now() + 'of', message: `Opponent fed to build.`, type: 'info' });
                        } else {
                            newTable.push({
                                    id: `pile-${playedCard.id}`,
                                    cards: [playedCard],
                                    isBuild: false
                            });
                            newLogs.push({ id: Date.now() + 'od', message: `Opponent discarded ${playedCard.suit} ${playedCard.rank}`, type: 'info' });
                        }
                    }
      }

      return {
          ...state,
          table: newTable,
          opponent: newOpponent,
          turn: 'player',
          logs: newLogs,
          lastCapturer
      };
    }

    case 'END_ROUND': {
        let newPlayer = { ...state.player };
        let newOpponent = { ...state.opponent };
        let newLogs = [...state.logs];

        if (state.table.length > 0 && state.lastCapturer) {
             const leftovers: Card[] = [];
             state.table.forEach(p => leftovers.push(...p.cards));
             
             if (state.lastCapturer === 'player') {
                 newPlayer.captured = [...newPlayer.captured, ...leftovers];
                 newLogs.push({id: 'end', message: 'You take remaining table cards.', type: 'info'});
             } else {
                 newOpponent.captured = [...newOpponent.captured, ...leftovers];
                 newLogs.push({id: 'end', message: 'Opponent takes remaining table cards.', type: 'info'});
             }
        }

        newPlayer = updatePlayerScore(newPlayer);
        newOpponent = updatePlayerScore(newOpponent);

        return {
            ...state,
            player: newPlayer,
            opponent: newOpponent,
            table: [],
            gameOver: true,
            logs: [...newLogs, {id: 'fin', message: 'Game Over!', type: 'alert'}]
        };
    }

    default:
      return state;
  }
};

const App: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Initialize
  useEffect(() => {
    dispatch({ type: 'INIT_GAME' });
  }, []);

  // Check for dealing or end game
  useEffect(() => {
    // Only check if game has actually started (table has been dealt or there are logs)
    const gameHasStarted = state.table.length > 0 || state.logs.length > 0;
    
    if (gameHasStarted && state.player.hand.length === 0 && state.opponent.hand.length === 0 && !state.gameOver) {
       if (state.deck.length > 0) {
           setTimeout(() => dispatch({ type: 'DEAL_CARDS' }), 1000);
       } else {
           setTimeout(() => dispatch({ type: 'END_ROUND' }), 1000);
       }
    }
  }, [state.player.hand.length, state.opponent.hand.length, state.deck.length, state.gameOver, state.table.length, state.logs.length]);

  // Trigger Opponent Move
  useEffect(() => {
      if (state.turn === 'opponent' && !state.gameOver) {
          const timer = setTimeout(() => {
              dispatch({ type: 'OPPONENT_MOVE' });
          }, 1500);
          return () => clearTimeout(timer);
      }
  }, [state.turn, state.gameOver]);

  const handleCardClick = (cardId: string) => {
    if (state.turn !== 'player') return;
    dispatch({ type: 'SELECT_HAND_CARD', cardId });
  };

  const handleTablePileClick = (pileId: string) => {
    if (state.turn !== 'player') return;
    dispatch({ type: 'TOGGLE_TABLE_PILE', pileId });
  };

  const handleCapture = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      // Check for identical card priority (Rule 3.2)
      const identicalPile = findIdenticalCard(handCard, state.table);
      if (identicalPile) {
          // Must capture identical card only
          if (state.selectedTablePileIds.length === 1 && state.selectedTablePileIds[0] === identicalPile.id) {
              dispatch({ type: 'PLAYER_MOVE', moveType: 'capture', playedCardId: handCard.id, targetPileIds: [identicalPile.id] });
          } else {
              alert("You must capture the identical card (mulle)!");
          }
          return;
      }

      const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
      if (canCapture(handCard, selectedPiles)) {
          dispatch({ type: 'PLAYER_MOVE', moveType: 'capture', playedCardId: handCard.id, targetPileIds: state.selectedTablePileIds });
      } else {
          alert("Invalid Capture! Check sums or special card rules.");
      }
  };

  const handleDiscard = () => {
      if (!state.selectedHandCardId) return;
      if (state.selectedTablePileIds.length > 0) {
          alert("Deselect table cards to discard.");
          return;
      }
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;
      const feedTarget = findFeedTarget(handCard, state.table, 'player');
      const playerHasBuild = state.table.some(p => p.isBuild && p.owner === 'player');
      if (playerHasBuild && !feedTarget) {
          alert("Du har ett bygge. Du får inte släppa kort till bordet. Bygg, bygg om, ta in eller trötta.");
          return;
      }
      dispatch({ type: 'PLAYER_MOVE', moveType: 'discard', playedCardId: handCard.id, targetPileIds: [] });
  };

  const handleBuildUp = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
      
      const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
      const targetValue = pilesSum + getTableValue(handCard);
      
      const playerBuilds = state.table.filter(p => p.isBuild && p.owner === 'player');
      const buildValue = canBuild(handCard, selectedPiles, state.player.hand, state.table, playerBuilds);
      
      if (buildValue === null) {
          alert(`Invalid Build! Need reservation card with value ${targetValue} (not already reserved).`);
          return;
      }
      
      dispatch({ 
          type: 'PLAYER_MOVE', 
          moveType: 'build', 
          playedCardId: handCard.id, 
          targetPileIds: state.selectedTablePileIds,
          buildDirection: 'up'
      });
  };

  const handleBuildDown = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
      
      if (selectedPiles.length !== 1 || !selectedPiles[0].isBuild || !selectedPiles[0].buildValue) {
          alert("Build Down only works on existing builds!");
          return;
      }
      
      const existingValue = selectedPiles[0].buildValue;
      const targetValue = Math.abs(existingValue - getTableValue(handCard));
      
      const playerBuilds = state.table.filter(p => p.isBuild && p.owner === 'player');
      const buildValue = canBuild(handCard, selectedPiles, state.player.hand, state.table, playerBuilds);
      
      if (buildValue === null) {
          alert(`Invalid Build Down! Need reservation card with value ${targetValue} (not already reserved).`);
          return;
      }
      
      dispatch({ 
          type: 'PLAYER_MOVE', 
          moveType: 'build', 
          playedCardId: handCard.id, 
          targetPileIds: state.selectedTablePileIds,
          buildDirection: 'down'
      });
  };

  const handleTrotta = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      // Use automatic trotta detection
      const consolidatable = canTrotta(handCard, state.table);
      
      if (consolidatable.length === 0) {
          alert("No cards on table can be tröttad with this card.");
          return;
      }

      // Dispatch trotta move
      dispatch({ 
          type: 'PLAYER_MOVE', 
          moveType: 'trotta', 
          playedCardId: handCard.id, 
          targetPileIds: consolidatable.map(p => p.id)
      });
  };

  const selectedCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
  const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
  const canPerformCapture = selectedCard && selectedPiles.length > 0 && canCapture(selectedCard, selectedPiles);
  
  // Build Up: Check if we can build with any selected piles
  const canPerformBuildUp = selectedCard && selectedPiles.length > 0 && (() => {
      let targetValue: number;
      if (selectedPiles.length === 1 && selectedPiles[0].isBuild && selectedPiles[0].buildValue) {
          targetValue = selectedPiles[0].buildValue + getTableValue(selectedCard);
      } else {
          const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
          targetValue = pilesSum + getTableValue(selectedCard);
      }
      return !!findCaptureCardForValue(state.player.hand, targetValue, selectedCard.id);
  })();
  
  // Build Down: Only on existing builds
  const canPerformBuildDown = selectedCard && selectedPiles.length === 1 && 
      selectedPiles[0].isBuild && selectedPiles[0].buildValue && (() => {
          const targetValue = Math.abs(selectedPiles[0].buildValue - getTableValue(selectedCard));
          return !!findCaptureCardForValue(state.player.hand, targetValue, selectedCard.id);
      })();
  
  // Trötta: Check if any piles on table match card's table value
  const canPerformTrotta = selectedCard && state.table.some(p => {
      const pileValue = getPileValue(p);
      const trottaValue = getTableValue(selectedCard);
      const hasTableMatch = (p.cards.length <= 2 && pileValue === trottaValue) || (p.isBuild && p.buildValue === trottaValue);
      if (!hasTableMatch) return false;
      // Need immediate capture card
      return !!findCaptureCardForValue(state.player.hand, trottaValue, selectedCard.id);
  });

  return (
    <div className="flex flex-col h-screen mx-auto p-1 gap-1 bg-gradient-to-br from-emerald-950 to-emerald-900">
      <div className="flex justify-between items-center bg-gradient-to-r from-emerald-900/80 to-emerald-800/80 p-2 rounded-lg backdrop-blur-sm border border-emerald-700/50 shadow-xl text-xs">
        <div className="flex-1">
          <div className="font-bold text-emerald-100 mb-1">🤖 Motståndare</div>
          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-emerald-300">
             <span>🎯 Mulles:</span><span className="text-yellow-300">{state.opponent.score.mullePoints}</span>
             <span>💯 Total:</span><span className="font-bold text-white">{state.opponent.score.total}</span>
          </div>
        </div>
        
        <div className="text-center px-2">
            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 tracking-wider uppercase">Mulle</h1>
            <div className="flex items-center gap-1 text-[10px]">
              <div className="bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-600">
                <span className="text-emerald-400">🃏 </span>
                <span className="text-white font-bold">{state.deck.length}</span>
              </div>
              <div className="bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-600">
                <span className="text-emerald-400">{state.turn === 'player' ? '👤' : '🤖'}</span>
              </div>
            </div>
        </div>

        <div className="flex-1 text-right">
          <div className="font-bold text-emerald-100 mb-1">Du 👤</div>
          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-emerald-300">
             <span>🎯 Mulles:</span><span className="text-yellow-300">{state.player.score.mullePoints}</span>
             <span>💯 Total:</span><span className="font-bold text-white">{state.player.score.total}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-emerald-800 to-emerald-900 rounded-xl border-2 border-emerald-950 shadow-2xl overflow-hidden">
        
        <div className="h-16 flex items-center justify-center -space-x-2 pt-1 bg-gradient-to-b from-emerald-950/30 to-transparent">
           {state.opponent.hand.map((card, i) => (
             <div key={card.id} style={{ transform: `rotate(${(i - state.opponent.hand.length/2) * 3}deg)` }} className="transition-transform">
                <CardComponent isSmall={true} />
             </div>
           ))}
        </div>

        <div className="flex-1 flex flex-wrap content-center justify-center gap-2 p-2">
            {state.table.map(pile => (
                <div 
                    key={pile.id} 
                    onClick={() => handleTablePileClick(pile.id)}
                    className={`relative group cursor-pointer transition-all duration-200 ${
                        state.selectedTablePileIds.includes(pile.id) 
                            ? 'scale-110 drop-shadow-2xl ring-4 ring-yellow-400' 
                            : 'hover:scale-105 hover:drop-shadow-xl'
                    }`}
                >
                    <div className="relative w-12 h-16 sm:w-16 sm:h-24">
                         {pile.cards.map((c, i) => (
                             <div key={c.id} className="absolute top-0 left-0 transition-all" style={{ top: i * 1, left: i * 1 }}>
                                 <CardComponent card={c} isSmall={false} isSelected={state.selectedTablePileIds.includes(pile.id) && i === pile.cards.length - 1} />
                             </div>
                         ))}
                    </div>
                    
                    {/* Badge for Build Info or Sum */}
                    <div className={`absolute -bottom-7 w-full text-center text-xs font-bold rounded-lg px-2 py-1 shadow-lg ${
                        pile.isBuild 
                            ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 text-white border border-yellow-400' 
                            : 'bg-black/60 text-emerald-200 border border-emerald-600'
                    }`}>
                        {pile.isBuild ? `🏗️ Bygg: ${pile.buildValue}` : `Σ ${getPileValue(pile)}`}
                        {pile.isLocked && <span className="ml-1">🔒</span>}
                    </div>
                </div>
            ))}
            {state.table.length === 0 && (
                <div className="text-emerald-500/40 text-5xl font-bold uppercase tracking-widest select-none flex flex-col items-center gap-2">
                    <span className="text-6xl">🎴</span>
                    <span>Tomt Bord</span>
                </div>
            )}
        </div>

        <div className="h-24 flex items-center justify-center space-x-1 pb-1 px-1 bg-gradient-to-t from-emerald-950/50 via-emerald-900/30 to-transparent">
            {state.player.hand.map((card) => (
                <div key={card.id} className="relative hover:z-10 transition-all duration-200 hover:-translate-y-3 hover:scale-105">
                    <CardComponent 
                        card={card} 
                        isSelected={state.selectedHandCardId === card.id}
                        onClick={() => handleCardClick(card.id)}
                    />
                     <div className={`text-center text-[8px] mt-0.5 font-semibold ${
                         state.selectedHandCardId === card.id 
                             ? 'text-yellow-300 scale-110' 
                             : 'text-emerald-400'
                     }`}>
                        {getHandValue(card)}
                    </div>
                </div>
            ))}
        </div>

        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 flex gap-0.5 pointer-events-none">
             {state.turn === 'player' && (
                 <div className="pointer-events-auto flex gap-0.5 bg-gradient-to-br from-black/70 to-black/50 p-1 rounded-lg backdrop-blur-md border border-emerald-700/50 shadow-2xl">
                    <button 
                        disabled={!canPerformCapture}
                        onClick={handleCapture}
                        className={`px-2 py-1 rounded-md font-bold uppercase text-[8px] flex items-center gap-0.5 ${
                            canPerformCapture 
                                ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-lg' 
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        🎯
                    </button>
                    <button 
                        disabled={!canPerformBuildUp}
                        onClick={handleBuildUp}
                        className={`px-2 py-1 rounded-md font-bold uppercase text-[8px] flex items-center gap-0.5 ${
                            canPerformBuildUp 
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg' 
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        ⬆️
                    </button>
                    <button 
                        disabled={!canPerformBuildDown}
                        onClick={handleBuildDown}
                        className={`px-2 py-1 rounded-md font-bold uppercase text-[8px] flex items-center gap-0.5 ${
                            canPerformBuildDown 
                                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg' 
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        ⬇️
                    </button>
                    <button 
                        disabled={!canPerformTrotta}
                        onClick={handleTrotta}
                        className={`px-2 py-1 rounded-md font-bold uppercase text-[8px] flex items-center gap-0.5 ${
                            canPerformTrotta 
                                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg' 
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        🔗
                    </button>
                    <button 
                         disabled={!state.selectedHandCardId}
                         onClick={handleDiscard}
                         className={`px-2 py-1 rounded-md font-bold uppercase text-[8px] flex items-center gap-0.5 ${
                             state.selectedHandCardId && state.selectedTablePileIds.length === 0 
                                 ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg' 
                                 : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                         }`}
                    >
                        🗑️
                    </button>
                 </div>
             )}
        </div>

        {state.gameOver && (
            <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-gradient-to-br from-emerald-800 to-emerald-900 border-4 border-yellow-500 p-10 rounded-3xl text-center max-w-xl shadow-2xl">
                    <h2 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 mb-8 animate-pulse">🏆 Spel Slut! 🏆</h2>
                    
                    <div className="grid grid-cols-2 gap-10 mb-10 text-left">
                        <div className="bg-emerald-950/50 p-6 rounded-2xl border-2 border-emerald-600">
                            <h3 className="text-2xl font-bold border-b-2 border-emerald-600 mb-4 pb-2 flex items-center gap-2">
                                <span>👤</span> Du
                            </h3>
                            <div className="space-y-2 text-emerald-200">
                                <p className="flex justify-between"><span>🎯 Mulles:</span><span className="text-yellow-300 font-bold">{state.player.score.mullePoints}</span></p>
                                <p className="flex justify-between"><span>🎴 Tabbes:</span><span className="text-white font-bold">{state.player.score.tabbePoints}</span></p>
                                <p className="flex justify-between"><span>⭐ Bonus:</span><span className="text-white font-bold">{state.player.score.bonus}</span></p>
                                <p className="text-3xl font-bold mt-4 pt-4 border-t-2 border-emerald-600 text-center text-white">{state.player.score.total}</p>
                            </div>
                        </div>
                        <div className="bg-emerald-950/50 p-6 rounded-2xl border-2 border-emerald-600">
                            <h3 className="text-2xl font-bold border-b-2 border-emerald-600 mb-4 pb-2 flex items-center gap-2">
                                <span>🤖</span> Motståndare
                            </h3>
                            <div className="space-y-2 text-emerald-200">
                                <p className="flex justify-between"><span>🎯 Mulles:</span><span className="text-yellow-300 font-bold">{state.opponent.score.mullePoints}</span></p>
                                <p className="flex justify-between"><span>🎴 Tabbes:</span><span className="text-white font-bold">{state.opponent.score.tabbePoints}</span></p>
                                <p className="flex justify-between"><span>⭐ Bonus:</span><span className="text-white font-bold">{state.opponent.score.bonus}</span></p>
                                <p className="text-3xl font-bold mt-4 pt-4 border-t-2 border-emerald-600 text-center text-white">{state.opponent.score.total}</p>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={() => window.location.reload()}
                        className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-4 px-10 rounded-2xl transition-all duration-200 text-lg shadow-lg hover:shadow-yellow-500/50 hover:scale-105"
                    >
                        🎮 Spela Igen
                    </button>
                </div>
            </div>
        )}

      </div>

      <div className="h-24 bg-gradient-to-br from-black/60 to-black/40 rounded-lg p-2 overflow-y-auto border border-emerald-800/50 backdrop-blur-sm shadow-xl">
           <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1 sticky top-0 bg-gradient-to-r from-emerald-950/90 to-emerald-900/90 backdrop-blur px-1 py-0.5 rounded-md w-full flex items-center gap-1">
               <span>📜</span> Spelhistorik
           </div>
           <div className="flex flex-col-reverse space-y-reverse space-y-0.5">
               {state.logs.map((log) => (
                   <div key={log.id} className={`text-[10px] py-0.5 px-1 rounded ${
                       log.type === 'alert' 
                           ? 'text-yellow-400 font-bold bg-yellow-900/20' 
                           : log.type === 'action' 
                               ? 'text-white bg-emerald-900/30' 
                               : 'text-emerald-300'
                   }`}>
                       <span className="opacity-60 text-[8px] mr-1">[{new Date(parseInt(log.id) || Date.now()).toLocaleTimeString().split(' ')[0].slice(0,5)}]</span>
                       {log.message}
                   </div>
               ))}
           </div>
      </div>
    </div>
  );
};

export default App;