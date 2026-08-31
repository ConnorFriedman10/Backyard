import { useState, useCallback } from 'react';

// Club grid density, in the spirit of the Xbox library's icon-size control.
//
// A display preference for this device rather than an account setting, so it lives in
// localStorage instead of the profile — switching to a laptop should not inherit the
// density you picked on a 34" monitor.
//
// 'medium' is exactly the layout that existed before this control, so the default renders
// pixel-identically to what it replaced.

export const CARD_SIZES = ['small', 'medium'];
export const DEFAULT_CARD_SIZE = 'medium';

const STORAGE_KEY = 'backyard.cardSize';

// localStorage throws in Safari private browsing and when a browser blocks storage
// entirely. This is a cosmetic preference, so failing to read or write it must never
// take the page down.
function readStored() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return CARD_SIZES.includes(stored) ? stored : DEFAULT_CARD_SIZE;
  } catch {
    return DEFAULT_CARD_SIZE;
  }
}

function writeStored(size) {
  try {
    window.localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Preference simply will not persist; the session still works.
  }
}

export function useCardSize() {
  // Lazy initialiser so localStorage is read once on mount rather than every render.
  const [cardSize, setCardSizeState] = useState(readStored);

  const setCardSize = useCallback((size) => {
    if (!CARD_SIZES.includes(size)) return;
    setCardSizeState(size);
    writeStored(size);
  }, []);

  return [cardSize, setCardSize];
}
