import React, { useState, useCallback } from 'react';
import { ClubGrid } from './ClubGrid';
import ExpandedTile from "./ExpandedTile";
import './ClubList.css';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from "framer-motion";

export const ClubList = ({ results, cardSize = 'medium' }) => {
  const [expandedClub, setExpandedClub] = useState(null);
  const handleClose = useCallback(() => setExpandedClub(null), []);

  if ( !results || results.length === 0) {
    return <p>No clubs found.</p>;
  }

  return (
    <>
      {/* data-size drives --card-min-width, which drives the column count; see ClubList.css. */}
      <div className="clubs-list" data-size={cardSize}>
        {results.map((club) => (
          <ClubGrid
            key={club.id}
            result={club}
            onExpand={setExpandedClub}
          />
        ))}
      </div>

      {/* Scoped to the tile alone. It previously also wrapped the always-mounted grid,
          which gave AnimatePresence a permanent child to track and meant the tile's exit
          animation never got a chance to play before unmount. */}
      <AnimatePresence>
        {expandedClub && (
          <ExpandedTile
            club={expandedClub}
            key={expandedClub.id}
            onClose={handleClose}
          />
        )}
      </AnimatePresence>
    </>
  );
};