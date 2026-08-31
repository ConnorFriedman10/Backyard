import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import borderBlackImg from '/src/assets/border.svg';
import borderHorizontalBlackImg from '/src/assets/border-horizontal.svg';

const BLUE = "#da0000ff";
const ROW_A = "#3b4b6c";
const ROW_B = "#51658dff";
const INK = "#CFD2E5";
const MUTED = "#ffffffff";
const VLINE = "#ffffffff";
const GRID_LINE = "#Ece7e5";

const ROW_H = 50;
const VISIBLE = 5;
const COLS = "64px 1fr 2fr";

const cellBase = { display: "flex", alignItems: "center", padding: "0 18px", overflow: "hidden", minWidth: 0, borderRight: `1px solid ${GRID_LINE}` };
const cellText = { fontSize: 16, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Barlow Condensed', sans-serif" };

export default function LinksTable({ links = [], onChange }) {
  const [activeKey, setActiveKey] = useState(null);
  const [rect, setRect] = useState(null);
  const activeElRef = useRef(null);

  const updateRect = useCallback(() => {
    const el = activeElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, []);

  const select = (key, el) => {
    activeElRef.current = el;
    setActiveKey(key);
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  };

  const clearSel = () => { setActiveKey(null); activeElRef.current = null; setRect(null); };

  useEffect(() => {
    if (!activeKey) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(updateRect); };
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    const onDown = (e) => {
      if (e.target.closest("[data-lt-cellkey]") || e.target.closest(".lt-cell-overlay")) return;
      clearSel();
    };
    const onKey = (e) => { if (e.key === "Escape") clearSel(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [activeKey, updateRect]);

  const setLinkField = (index, field, val) => {
    const next = links.slice();
    if (index === links.length) {
      next.push({ id: `link_${Date.now()}`, name: "", url: "", enabled: true });
    }
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  };

  const deleteLink = (index) => {
    onChange(links.filter((_, i) => i !== index));
    clearSel();
  };

  // Build visible rows: data rows + 1 trailing add row + filler to fill VISIBLE slots
  const rows = links.map((l, i) => ({ kind: "data", ...l, _idx: i }));
  rows.push({ kind: "add", name: "", url: "", _idx: links.length });
  while (rows.length < VISIBLE) rows.push({ kind: "filler", _idx: rows.length });

  // Derive overlay meta from activeKey
  let overlay = null;
  if (activeKey && rect) {
    const [idxS, col] = activeKey.split(":");
    const index = Number(idxS);
    const link = links[index];
    const isName = col === "name";
    overlay = {
      value: link ? (isName ? link.name : link.url) : "",
      editable: true,
      placeholder: isName ? "e.g. Instagram" : "https://...",
      maxLength: isName ? 15 : 200,
      onChange: (v) => setLinkField(index, isName ? "name" : "url", v),
    };
  }

  return (
    <div style={{ width: "100%", marginTop: "8px", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <style>{cssText}</style>
      <div style={{ overflowX: "auto" }}>
        <div className="lt-table-box" style={{ position: "relative", minWidth: 400, border: `2px solid ${VLINE}`, borderRadius: 0, overflow: "hidden" }}>
          <img src={borderBlackImg} alt="" className="lt-border lt-border-left" />
          <img src={borderBlackImg} alt="" className="lt-border lt-border-right" />
          <div
            className="lt-border-h-wrap lt-border-top-wrap"
            style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
            aria-hidden="true"
          />
          <div
            className="lt-border-h-wrap lt-border-bottom-wrap"
            style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
            aria-hidden="true"
          />
          <div className="lt-scroll" style={{ height: VISIBLE * ROW_H, overflowY: "auto", overflowX: "hidden" }}>
            {rows.map((row, i) => {
              if (row.kind === "filler") {
                return (
                  <div
                    key={`f${i}`}
                    style={{ display: "grid", gridTemplateColumns: COLS, height: ROW_H, background: i % 2 === 0 ? ROW_A : ROW_B, borderBottom: `1px solid ${GRID_LINE}` }}
                  />
                );
              }

              const idx = row._idx;
              const nameCK = `${idx}:name`;
              const urlCK = `${idx}:url`;

              return (
                <div
                  key={`r${idx}`}
                  style={{ display: "grid", gridTemplateColumns: COLS, height: ROW_H, background: i % 2 === 0 ? ROW_A : ROW_B, borderBottom: `1px solid ${GRID_LINE}` }}
                >
                  {/* Delete / empty */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${GRID_LINE}` }}>
                    {row.kind === "data" ? (
                      <button
                        onClick={() => deleteLink(idx)}
                        onMouseDown={(e) => e.stopPropagation()}
                        aria-label="Delete link"
                        style={{ all: "unset", cursor: "pointer", color: MUTED, fontSize: 18, lineHeight: 1, padding: 6 }}
                      >
                        ×
                      </button>
                    ) : <div />}
                  </div>

                  {/* Name cell */}
                  <div
                    data-lt-cellkey={nameCK}
                    onMouseDown={(e) => select(nameCK, e.currentTarget)}
                    style={{
                      ...cellBase,
                      boxShadow: activeKey === nameCK ? "inset 0 0 0 2px #000" : "none",
                      cursor: "text",
                    }}
                  >
                    {row.kind === "data" && row.name
                      ? <span style={cellText}>{row.name}</span>
                      : <span style={{ ...cellText, color: MUTED }}>{row.kind === "add" ? "e.g. Instagram" : ""}</span>}
                  </div>

                  {/* URL cell */}
                  <div
                    data-lt-cellkey={urlCK}
                    onMouseDown={(e) => select(urlCK, e.currentTarget)}
                    style={{
                      ...cellBase,
                      borderRight: "none",
                      boxShadow: activeKey === urlCK ? "inset 0 0 0 2px #000" : "none",
                      cursor: "text",
                    }}
                  >
                    {row.kind === "data" && row.url
                      ? <span style={cellText}>{row.url}</span>
                      : <span style={{ ...cellText, color: MUTED }}>{row.kind === "add" ? "https://..." : ""}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {overlay && rect && <Overlay rect={rect} meta={overlay} onClose={clearSel} />}
    </div>
  );
}

function Overlay({ rect, meta, onClose }) {
  const taRef = useRef(null);

  const resize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(rect.height - 16, ta.scrollHeight) + "px";
  };

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.focus(); resize(); }
  });

  const maxW = Math.min(560, Math.max(rect.width, rect.width * 2.2));

  return (
    <div
      className="lt-cell-overlay"
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        minWidth: rect.width,
        maxWidth: maxW,
        minHeight: rect.height,
        zIndex: 9600,
        background: "#CFD2E5",
        border: "1px solid #000",
        borderRadius: 3,
        boxShadow: "0 6px 22px rgba(0,0,0,0.22)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
      }}
    >
      <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <textarea
          ref={taRef}
          value={meta.value}
          placeholder={meta.placeholder}
          maxLength={meta.maxLength}
          onChange={(e) => { meta.onChange(e.target.value); resize(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onClose(); } }}
          rows={1}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 16,
            color: "#000",
            lineHeight: 1.3,
            fontFamily: "'Barlow Condensed', sans-serif",
            padding: "9px 0",
            overflow: "hidden",
          }}
        />
        {meta.maxLength && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span style={{ fontSize: "0.72rem", color: "#000" }}>{meta.value.length}/{meta.maxLength}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const cssText = `
  .lt-scroll::-webkit-scrollbar { width: 12px; }
  .lt-scroll::-webkit-scrollbar-thumb { background: #cfcfcf; border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
  .lt-scroll::-webkit-scrollbar-track { background: transparent; }
  .lt-cell-overlay textarea::placeholder { color: ${MUTED}; }

  /* Subtle noise/grain overlay on top of the table's background */
  .lt-table-box::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.19'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
  }

  /* Decorative vine border (black, matches the calendar's) */
  .lt-border {
    position: absolute;
    top: 0;
    height: 100%;
    width: auto;
    pointer-events: none;
    z-index: 5;
  }
  .lt-border-left { left: 0; transform: scaleX(1.2); transform-origin: left center; }
  .lt-border-right { right: 0; transform: scaleX(-1.2); transform-origin: center; }

  .lt-border-h-wrap {
    position: absolute;
    left: 0;
    width: 100%;
    height: 4px;
    background-repeat: repeat-x;
    background-position: left center;
    background-size: auto 100%;
    pointer-events: none;
    z-index: 5;
  }
  .lt-border-top-wrap { top: 0; }
  .lt-border-bottom-wrap { bottom: 0; }

  /* Safari-only (matches WebKit desktop + iOS, not Chrome/Firefox): the ink-line
     SVG border doesn't render reliably here, so swap it for a plain 1px solid
     border in the same color instead of trying to fix the SVG rendering.
     !important is required because .lt-table-box's white border is set inline
     (style={{ border: ... }}), which a stylesheet rule can't outrank otherwise. */
  @supports (-webkit-hyphens: none) {
    .lt-border,
    .lt-border-h-wrap {
      display: none;
    }
    .lt-table-box {
      border: 1px solid #000 !important;
    }
  }
`;
