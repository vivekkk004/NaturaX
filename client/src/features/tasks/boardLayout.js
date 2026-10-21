/**
 * Kanban sizing, shared by the card and the column so they always agree:
 * every card has the same fixed height and a column's scroll area fits exactly VISIBLE_CARDS.
 */
export const VISIBLE_CARDS = 3;
export const CARD_HEIGHT_REM = 10.5;
export const CARD_GAP_REM = 0.625; // Tailwind gap-2.5

export const COLUMN_SCROLL_HEIGHT = `${VISIBLE_CARDS * CARD_HEIGHT_REM + (VISIBLE_CARDS - 1) * CARD_GAP_REM}rem`;
export const CARD_HEIGHT = `${CARD_HEIGHT_REM}rem`;
