import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './InterestsModal.css';

const MAX_CATEGORIES = 3;
const MAX_SUBCATEGORIES = 3;

// Cycled by index across each category's subcategory list so adjacent pills
// read as distinct chips rather than a uniform gray row.
const SUB_COLORS = ['#FC7200', '#ffcc13', '#56758b'];

export function InterestsModal({ onClose }) {
  const [taxonomy, setTaxonomy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Set of selected category IDs, ordered by selection time
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  // Map<categoryId, Set<subcategoryId>>
  const [selectedSubs, setSelectedSubs] = useState(new Map());

  useEffect(() => {
    async function load() {
      try {
        const [taxonomyData, userInterests] = await Promise.all([
          apiFetch('/interests', { auth: false }),
          apiFetch('/me/interests'),
        ]);

        setTaxonomy(taxonomyData || []);

        // Restore existing selections
        const catIds = [];
        const subsMap = new Map();
        for (const item of userInterests || []) {
          catIds.push(item.category_id);
          subsMap.set(item.category_id, new Set(item.subcategory_ids || []));
        }
        setSelectedCategoryIds(catIds);
        setSelectedSubs(subsMap);
      } catch (err) {
        console.error('Failed to load interests:', err);
        setError('Failed to load interests. Please try again.');
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggleCategory = useCallback((catId) => {
    setSelectedCategoryIds(prev => {
      if (prev.includes(catId)) {
        // Deselect — also clear its subcategories
        setSelectedSubs(s => {
          const next = new Map(s);
          next.delete(catId);
          return next;
        });
        return prev.filter(id => id !== catId);
      }
      if (prev.length >= MAX_CATEGORIES) return prev; // already at max
      return [...prev, catId];
    });
  }, []);

  const toggleSub = useCallback((catId, subId) => {
    setSelectedSubs(prev => {
      const current = new Set(prev.get(catId) || []);
      if (current.has(subId)) {
        current.delete(subId);
      } else {
        if (current.size >= MAX_SUBCATEGORIES) return prev; // already at max
        current.add(subId);
      }
      const next = new Map(prev);
      next.set(catId, current);
      return next;
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const interests = selectedCategoryIds.map(catId => ({
        category_id: catId,
        subcategory_ids: [...(selectedSubs.get(catId) || [])],
      }));
      await apiFetch('/me/interests', { method: 'PUT', body: { interests } });
      onClose();
    } catch (err) {
      console.error('Failed to save interests:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Build a lookup for selected categories so subcategory sections render in selection order
  const selectedCategoryObjects = selectedCategoryIds
    .map(id => taxonomy.find(c => c.id === id))
    .filter(Boolean);

  return (
    <div className="interests-overlay" onClick={onClose}>
      <div className="interests-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="interests-header">
          <div>
            <h2 className="interests-title">Your Interests</h2>
            <p className="interests-subtitle">
              Pick up to {MAX_CATEGORIES} categories and {MAX_SUBCATEGORIES} subcategories each.
            </p>
          </div>
          <button className="interests-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* ── Category count pill ── */}
        <div className="interests-count-row">
          <span className="interests-count">
            {selectedCategoryIds.length} / {MAX_CATEGORIES} categories
          </span>
        </div>

        <div className="interests-scroll">
          {loading ? (
            <p className="interests-loading">Loading…</p>
          ) : (
            <>
              {/* ── Category pills ── */}
              <div className="interests-pill-grid">
                {taxonomy.map(cat => {
                  const isSelected = selectedCategoryIds.includes(cat.id);
                  const atMax = selectedCategoryIds.length >= MAX_CATEGORIES;
                  return (
                    <button
                      key={cat.id}
                      className={`interests-pill${isSelected ? ' interests-pill--selected' : ''}${!isSelected && atMax ? ' interests-pill--disabled' : ''}`}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>

              {/* ── Subcategory sections (one per selected category, in selection order) ── */}
              {selectedCategoryObjects.length > 0 && (
                <div className="interests-subs-area">
                  {selectedCategoryObjects.map(cat => {
                    const currentSubs = selectedSubs.get(cat.id) || new Set();
                    const atSubMax = currentSubs.size >= MAX_SUBCATEGORIES;
                    // One color per selected category (by selection order), shared by
                    // all of its selected subcategory pills — not cycled per-subcategory,
                    // so e.g. every selected "Greek Life" sub pill reads as the same blue.
                    const categoryColor = SUB_COLORS[selectedCategoryIds.indexOf(cat.id) % SUB_COLORS.length];
                    return (
                      <div key={cat.id} className="interests-sub-section">
                        <div className="interests-sub-header">
                          <span className="interests-sub-label">{cat.name}</span>
                          <span className="interests-sub-count">
                            {currentSubs.size} / {MAX_SUBCATEGORIES}
                          </span>
                        </div>
                        <div className="interests-pill-grid interests-pill-grid--subs">
                          {cat.subcategories.map(sub => {
                            const isSubSelected = currentSubs.has(sub.id);
                            return (
                              <button
                                key={sub.id}
                                className={`interests-pill interests-pill--sm${isSubSelected ? ' interests-pill--selected' : ''}${!isSubSelected && atSubMax ? ' interests-pill--disabled' : ''}`}
                                onClick={() => toggleSub(cat.id, sub.id)}
                                disabled={!isSubSelected && atSubMax}
                                style={{ '--sub-color': categoryColor }}
                              >
                                {sub.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && <p className="interests-error">{error}</p>}
            </>
          )}
        </div>

        {/* ── Save button ── */}
        <div className="interests-footer">
          <div className="duo-btn-wrap">
            <div className="duo-btn-pill" aria-hidden="true" />
            <button
              className="interests-save-btn duo-btn"
              onClick={handleSave}
              disabled={saving || loading || loadError}
              style={{ '--duo-shadow': '#1a1a1a' }}
            >
              {saving ? 'Saving…' : 'Save Interests'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default InterestsModal;
