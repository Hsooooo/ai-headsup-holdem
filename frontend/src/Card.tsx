import React from 'react';

interface CardProps {
    card?: string; // e.g. 'As', 'Th' or undefined (face down)
}

export const Card: React.FC<CardProps> = ({ card }) => {
    if (!card) {
        return <div className="card-face card-back" />;
    }

    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const isRed = suit === 'h' || suit === 'd';

    let suitSymbol = suit;
    if (suit === 's') suitSymbol = '♠';
    if (suit === 'h') suitSymbol = '♥';
    if (suit === 'd') suitSymbol = '♦';
    if (suit === 'c') suitSymbol = '♣';

    return (
        <div className={`card-face ${isRed ? 'red' : ''}`}>
            {rank}{suitSymbol}
        </div>
    );
};
