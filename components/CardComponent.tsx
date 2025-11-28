import React from 'react';
import { Card, Suit } from '../types';
import { SUIT_SYMBOLS, getRankLabel } from '../constants';

interface CardProps {
  card?: Card; // If null, render card back
  onClick?: () => void;
  isSelected?: boolean;
  isSmall?: boolean; // For piles
  className?: string;
}

const CardComponent: React.FC<CardProps> = ({ card, onClick, isSelected, isSmall, className = '' }) => {
  if (!card) {
    return (
      <div 
        className={`relative ${isSmall ? 'w-9 h-12 sm:w-10 sm:h-14' : 'w-16 h-24 sm:w-20 sm:h-28'} bg-blue-800 rounded border-2 border-white shadow-md flex items-center justify-center cursor-default ${className}`}
      >
        <div className="w-full h-full border border-blue-600 rounded opacity-50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
      </div>
    );
  }

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;

  return (
    <div
      onClick={onClick}
      className={`
        relative ${isSmall ? 'w-9 h-12 text-[10px] sm:w-10 sm:h-14 sm:text-xs' : 'w-16 h-24 text-sm sm:w-20 sm:h-28 sm:text-base'} 
        bg-white rounded border-2 shadow-md flex flex-col items-center justify-between p-1 cursor-pointer transition-all duration-200
        ${isSelected ? 'border-yellow-400 -translate-y-2 ring-2 ring-yellow-400' : 'border-gray-300 hover:-translate-y-1'}
        ${className}
      `}
    >
      {/* Top Left */}
      <div className={`self-start leading-none ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div className="font-bold">{getRankLabel(card.rank)}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>

      {/* Center Big */}
      <div className={`text-xl sm:text-2xl ${isRed ? 'text-red-600' : 'text-black'}`}>
        {SUIT_SYMBOLS[card.suit]}
      </div>

      {/* Bottom Right (Rotated) */}
      <div className={`self-end leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div className="font-bold">{getRankLabel(card.rank)}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
    </div>
  );
};

export default CardComponent;