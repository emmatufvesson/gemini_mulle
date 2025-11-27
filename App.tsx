import React, { useState, useEffect, useReducer } from 'react';
import { GameState, Card, TablePile, PlayerState, GameLog, Suit, Rank } from './types';
import { createDeck, getHandValue, getPileValue, getMullePoints, updatePlayerScore, canCapture, findBestMove, getTableValue, canBuild, calculateMulleScore } from './services/gameLogic';
import { INITIAL_TABLE_SIZE, HAND_SIZE, TOTAL_ROUNDS } from './constants';
import CardComponent from './components/CardComponent';

// --- Reducer for complex state logic ---

type Action = 
  | { type: 'INIT_GAME' }
  | { type: 'DEAL_CARDS' }
  | { type: 'SELECT_HAND_CARD', cardId: string }
  | { type: 'TOGGLE_TABLE_PILE', pileId: string }
  | { type: 'PLAYER_MOVE', moveType: 'capture' | 'discard' | 'build' | 'trotta', playedCardId: string, targetPileIds: string[] }
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
        let allInvolvedCards: Card[] = [playedCard];
        let tabbePoints = 0;

        capturedPiles.forEach(p => {
          allInvolvedCards = [...allInvolvedCards, ...p.cards];
        });

        // Calculate Points using centralized logic
        const mullePts = calculateMulleScore(allInvolvedCards);
        if (mullePts > 0) {
            newLogs.push({ id: Date.now().toString() + 'pm', message: `MULLE! +${mullePts} points`, type: 'alert' });
        }

        newPlayer.captured = [...newPlayer.captured, ...allInvolvedCards];
        newTable = newTable.filter(p => !targetPileIds.includes(p.id));

        if (newTable.length === 0) {
          tabbePoints += 1;
          newLogs.push({ id: Date.now() + 't', message: "TABBE! +1 point", type: 'alert' });
        }

        newPlayer.score.mullePoints += mullePts;
        newPlayer.score.tabbePoints += tabbePoints;
        newPlayer = updatePlayerScore(newPlayer);
        lastCapturer = 'player';
        
        newLogs.push({ id: Date.now() + 'c', message: `You captured ${allInvolvedCards.length - 1} cards.`, type: 'action' });

      } else if (moveType === 'discard') {
        newTable.push({
          id: `pile-${playedCard.id}`,
          cards: [playedCard],
          isBuild: false
        });
        newLogs.push({ id: Date.now() + 'd', message: `You discarded ${playedCard.suit} ${playedCard.rank}.`, type: 'info' });
      } else if (moveType === 'build') {
        // Build: Combine played card with selected piles
        const builtPiles = state.table.filter(p => targetPileIds.includes(p.id));
        let buildCards: Card[] = [playedCard];
        builtPiles.forEach(p => {
          buildCards = [...buildCards, ...p.cards];
        });
        
        // Calculate build value from played card's hand value
        const buildValue = getHandValue(playedCard);
        
        // Remove old piles
        newTable = newTable.filter(p => !targetPileIds.includes(p.id));
        
        // Add new build pile
        newTable.push({
          id: `build-${Date.now()}`,
          cards: buildCards,
          isBuild: true,
          buildValue: buildValue,
          owner: 'player',
          isLocked: false
        });
        
        newLogs.push({ id: Date.now() + 'pb', message: `You built ${buildValue}.`, type: 'info' });
      } else if (moveType === 'trotta') {
        // Trötta: Consolidate all matching cards into locked build
        const trottaPiles = state.table.filter(p => targetPileIds.includes(p.id));
        let trottaCards: Card[] = [playedCard];
        const trottaValue = getTableValue(playedCard);
        
        trottaPiles.forEach(p => {
          trottaCards = [...trottaCards, ...p.cards];
        });
        
        // Remove consolidated piles
        newTable = newTable.filter(p => !targetPileIds.includes(p.id));
        
        // Create locked build
        newTable.push({
          id: `trotta-${Date.now()}`,
          cards: trottaCards,
          isBuild: true,
          buildValue: trottaValue,
          owner: 'player',
          isLocked: true // Trötta always locks
        });
        
        newLogs.push({ id: Date.now() + 'ptr', message: `You tröttade ${trottaValue} (${trottaCards.length} cards).`, type: 'action' });
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
         let allInvolvedCards: Card[] = [playedCard];
         let tabbePoints = 0;

         capturedPiles.forEach(p => {
            allInvolvedCards = [...allInvolvedCards, ...p.cards];
         });

         const mullePts = calculateMulleScore(allInvolvedCards);
         if (mullePts > 0) {
             newLogs.push({ id: Date.now() + 'om', message: `Opponent Mulle! +${mullePts} pts`, type: 'alert' });
         }

         newOpponent.captured = [...newOpponent.captured, ...allInvolvedCards];
         newTable = newTable.filter(p => !move.pileIds.includes(p.id));

         if (newTable.length === 0) {
             tabbePoints += 1;
             newLogs.push({ id: Date.now() + 'ot', message: "Opponent scored a Tabbe!", type: 'alert' });
         }

         newOpponent.score.mullePoints += mullePts;
         newOpponent.score.tabbePoints += tabbePoints;
         newOpponent = updatePlayerScore(newOpponent);
         lastCapturer = 'opponent';
         newLogs.push({ id: Date.now() + 'oc', message: `Opponent captured with ${playedCard.suit} ${playedCard.rank}`, type: 'info' });

      } else if (move.type === 'build') {
         // Perform Build
         const builtPiles = state.table.filter(p => move.pileIds.includes(p.id));
         let buildCards: Card[] = [playedCard];
         builtPiles.forEach(p => {
             buildCards = [...buildCards, ...p.cards];
         });
         
         // Remove old piles
         newTable = newTable.filter(p => !move.pileIds.includes(p.id));
         
         // Add new build pile
         newTable.push({
             id: `build-${Date.now()}`,
             cards: buildCards,
             isBuild: true,
             buildValue: move.buildValue,
             owner: 'opponent',
             isLocked: false // Initially open
         });
         
         newLogs.push({ id: Date.now() + 'ob', message: `Opponent built ${move.buildValue}.`, type: 'info' });

      } else {
          // Discard
          newTable.push({
              id: `pile-${playedCard.id}`,
              cards: [playedCard],
              isBuild: false
          });
          newLogs.push({ id: Date.now() + 'od', message: `Opponent discarded ${playedCard.rank}.`, type: 'info' });
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
      dispatch({ type: 'PLAYER_MOVE', moveType: 'discard', playedCardId: state.selectedHandCardId, targetPileIds: [] });
  };

  const handleBuild = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
      const buildValue = canBuild(handCard, selectedPiles, state.player.hand);
      
      if (buildValue) {
          dispatch({ type: 'PLAYER_MOVE', moveType: 'build', playedCardId: handCard.id, targetPileIds: state.selectedTablePileIds });
      } else {
          alert("Invalid Build! You need a reservation card in hand.");
      }
  };

  const handleTrotta = () => {
      if (!state.selectedHandCardId) return;
      const handCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
      if (!handCard) return;

      // Trötta: Consolidate ALL cards/piles with same table value
      const trottaValue = getTableValue(handCard);
      
      // Find all matching piles/cards on table
      const matchingPiles = state.table.filter(p => {
          const pileValue = getPileValue(p);
          // Match singles, 2-card structures, or builds with this value
          if (p.cards.length <= 2 && pileValue === trottaValue) return true;
          if (p.isBuild && p.buildValue === trottaValue) return true;
          return false;
      });

      if (matchingPiles.length === 0) {
          alert("No cards on table match this card's value for Trötta.");
          return;
      }

      // Dispatch trotta move
      dispatch({ 
          type: 'PLAYER_MOVE', 
          moveType: 'trotta', 
          playedCardId: handCard.id, 
          targetPileIds: matchingPiles.map(p => p.id)
      });
  };

  const selectedCard = state.player.hand.find(c => c.id === state.selectedHandCardId);
  const selectedPiles = state.table.filter(p => state.selectedTablePileIds.includes(p.id));
  const canPerformCapture = selectedCard && selectedPiles.length > 0 && canCapture(selectedCard, selectedPiles);
  const canPerformBuild = selectedCard && canBuild(selectedCard, selectedPiles, state.player.hand) !== null;
  
  // Trötta: Check if any piles on table match card's table value
  const canPerformTrotta = selectedCard && state.table.some(p => {
      const pileValue = getPileValue(p);
      const trottaValue = getTableValue(selectedCard);
      return (p.cards.length <= 2 && pileValue === trottaValue) || 
             (p.isBuild && p.buildValue === trottaValue);
  });

  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto p-4 gap-4">
      <div className="flex justify-between items-start bg-emerald-900/50 p-4 rounded-lg backdrop-blur-sm border border-emerald-700">
        <div>
          <h2 className="text-xl font-bold text-emerald-100">Opponent</h2>
          <div className="text-sm text-emerald-300 space-x-3">
             <span>Mulles: {state.opponent.score.mullePoints}</span>
             <span>Intake: {state.opponent.score.intakePoints}</span>
             <span>Bonus: {state.opponent.score.bonus}</span>
             <span className="font-bold text-white">Total: {state.opponent.score.total}</span>
          </div>
        </div>
        
        <div className="text-center">
            <h1 className="text-3xl font-black text-yellow-400 tracking-wider uppercase drop-shadow-md">Mulle</h1>
            <div className="text-xs text-emerald-400">Cards left: {state.deck.length}</div>
        </div>

        <div className="text-right">
          <h2 className="text-xl font-bold text-emerald-100">You</h2>
          <div className="text-sm text-emerald-300 space-x-3">
             <span>Mulles: {state.player.score.mullePoints}</span>
             <span>Intake: {state.player.score.intakePoints}</span>
             <span>Bonus: {state.player.score.bonus}</span>
             <span className="font-bold text-white">Total: {state.player.score.total}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative bg-emerald-800 rounded-xl border-8 border-emerald-900 shadow-inner overflow-hidden">
        
        <div className="h-32 flex items-center justify-center -space-x-4 pt-4">
           {state.opponent.hand.map((card, i) => (
             <div key={card.id} style={{ transform: `rotate(${(i - state.opponent.hand.length/2) * 5}deg)` }}>
                <CardComponent isSmall={false} />
             </div>
           ))}
        </div>

        <div className="flex-1 flex flex-wrap content-center justify-center gap-4 p-8">
            {state.table.map(pile => (
                <div 
                    key={pile.id} 
                    onClick={() => handleTablePileClick(pile.id)}
                    className={`relative group cursor-pointer transition-transform ${state.selectedTablePileIds.includes(pile.id) ? 'scale-110' : ''}`}
                >
                    <div className="relative w-20 h-28">
                         {pile.cards.map((c, i) => (
                             <div key={c.id} className="absolute top-0 left-0 transition-all" style={{ top: i * 2, left: i * 2 }}>
                                 <CardComponent card={c} isSmall={false} isSelected={state.selectedTablePileIds.includes(pile.id) && i === pile.cards.length - 1} />
                             </div>
                         ))}
                    </div>
                    
                    {/* Badge for Build Info or Sum */}
                    <div className={`absolute -bottom-6 w-full text-center text-xs font-bold rounded px-1 ${pile.isBuild ? 'bg-yellow-600 text-white' : 'bg-black/30 text-emerald-200'}`}>
                        {pile.isBuild ? `Build: ${pile.buildValue}` : `Sum: ${getPileValue(pile)}`}
                    </div>
                </div>
            ))}
            {state.table.length === 0 && (
                <div className="text-emerald-500/30 text-4xl font-bold uppercase tracking-widest select-none">
                    Empty Table
                </div>
            )}
        </div>

        <div className="h-40 flex items-center justify-center space-x-2 pb-4 px-4 bg-gradient-to-t from-emerald-900 to-transparent">
            {state.player.hand.map((card) => (
                <div key={card.id} className="hover:z-10 transition-transform hover:-translate-y-4">
                    <CardComponent 
                        card={card} 
                        isSelected={state.selectedHandCardId === card.id}
                        onClick={() => handleCardClick(card.id)}
                    />
                     <div className="text-center text-[10px] mt-1 text-emerald-300">
                        val: {getHandValue(card)}
                    </div>
                </div>
            ))}
        </div>

        <div className="absolute bottom-40 left-1/2 transform -translate-x-1/2 flex gap-4 pointer-events-none">
             {state.turn === 'player' && (
                 <div className="pointer-events-auto flex gap-2 bg-black/50 p-2 rounded-lg backdrop-blur">
                    <button 
                        disabled={!canPerformCapture}
                        onClick={handleCapture}
                        className={`px-4 py-2 rounded font-bold uppercase tracking-wider transition-colors text-sm ${canPerformCapture ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                    >
                        Capture
                    </button>
                    <button 
                        disabled={!canPerformBuild}
                        onClick={handleBuild}
                        className={`px-4 py-2 rounded font-bold uppercase tracking-wider transition-colors text-sm ${canPerformBuild ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                    >
                        Build
                    </button>
                    <button 
                        disabled={!canPerformTrotta}
                        onClick={handleTrotta}
                        className={`px-4 py-2 rounded font-bold uppercase tracking-wider transition-colors text-sm ${canPerformTrotta ? 'bg-purple-500 hover:bg-purple-400 text-white shadow-lg' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                    >
                        Trötta
                    </button>
                    <button 
                         disabled={!state.selectedHandCardId}
                         onClick={handleDiscard}
                         className={`px-4 py-2 rounded font-bold uppercase tracking-wider transition-colors text-sm ${state.selectedHandCardId && state.selectedTablePileIds.length === 0 ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                    >
                        Discard
                    </button>
                 </div>
             )}
        </div>

        {state.gameOver && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
                <div className="bg-emerald-800 border-2 border-yellow-500 p-8 rounded-xl text-center max-w-md shadow-2xl">
                    <h2 className="text-4xl font-bold text-yellow-400 mb-6">Game Over</h2>
                    
                    <div className="grid grid-cols-2 gap-8 mb-8 text-left">
                        <div>
                            <h3 className="text-lg font-bold border-b border-emerald-600 mb-2">You</h3>
                            <p>Mulles: {state.player.score.mullePoints}</p>
                            <p>Tabbes: {state.player.score.tabbePoints}</p>
                            <p>Bonus: {state.player.score.bonus}</p>
                            <p className="text-2xl font-bold mt-2 text-white">{state.player.score.total}</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold border-b border-emerald-600 mb-2">Opponent</h3>
                            <p>Mulles: {state.opponent.score.mullePoints}</p>
                            <p>Tabbes: {state.opponent.score.tabbePoints}</p>
                            <p>Bonus: {state.opponent.score.bonus}</p>
                            <p className="text-2xl font-bold mt-2 text-white">{state.opponent.score.total}</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => window.location.reload()}
                        className="bg-yellow-500 text-black font-bold py-3 px-8 rounded hover:bg-yellow-400 transition-colors"
                    >
                        Play Again
                    </button>
                </div>
            </div>
        )}

      </div>

      <div className="h-32 bg-black/40 rounded-lg p-2 overflow-y-auto border border-emerald-800/50">
           <div className="text-xs font-bold text-emerald-500 uppercase mb-1 sticky top-0 bg-black/20 backdrop-blur w-full">Game Log</div>
           <div className="flex flex-col-reverse">
               {state.logs.map((log) => (
                   <div key={log.id} className={`text-sm py-0.5 ${log.type === 'alert' ? 'text-yellow-400 font-bold' : log.type === 'action' ? 'text-white' : 'text-emerald-300'}`}>
                       <span className="opacity-50 text-[10px] mr-2">[{new Date(parseInt(log.id) || Date.now()).toLocaleTimeString().split(' ')[0]}]</span>
                       {log.message}
                   </div>
               ))}
           </div>
      </div>
    </div>
  );
};

export default App;