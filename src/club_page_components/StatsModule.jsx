import React, { useState, useEffect, useRef } from 'react';
import './StatsModule.css';

const STAT_COLORS = [
    '#382825',
    '#56758b',
    '#BE0D00',
    '#FC7200',
    '#ffcc13',
    '#857a75',
    '#a39a96',
    '#d3d1c9ff',
    '#382825',
    '#56758b',
    '#BE0D00',
    '#FC7200',
    '#ffcc13',
    '#857a75',
    '#a39a96',
    '#d3d1c9ff',

];

const fill = (backgroundColor, start, end, value) => {
    const percentage = ((value - start) / (end - start)) * 100
    return `linear-gradient(to right, ${backgroundColor} ${percentage}%, #ffffffff ${percentage}%)`
};

function CountUp({ target, animate, delay }) {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!animate) {
            setDisplay(0);
            return;
        }

        const timeout = setTimeout(() => {
            const duration = 800;
            const start = performance.now();

            const tick = (now) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                setDisplay(parseFloat((eased * target).toFixed(1)));
                if (progress < 1) rafRef.current = requestAnimationFrame(tick);
            };

            rafRef.current = requestAnimationFrame(tick);
        }, delay);

        return () => {
            clearTimeout(timeout);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [animate, target, delay]);

    return <>{display}</>;
}

function StatsModule({ data, editing, onChange, warning }) {
    const [animated, setAnimated] = useState(false);
    const cardRef = useRef(null);
    const stats = data?.stats || [];

    useEffect(() => {
        if (!cardRef.current || editing || stats.length === 0) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setAnimated(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.3 }
        );

        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [stats.length, editing]);

    const updateStat = (index, field, value) => {
        const updated = stats.map((s, i) =>
            i === index ? { ...s, [field]: value } : s
        );
        onChange({ ...data, stats: updated });
    };

    const addStat = (type) => {
        if (stats.length >= 8) return;
        // true indicates qualitative stat (no unit, has max)
        if (type) onChange({ ...data, stats: [...stats, { label: '', value: 0, max: 10, type: "qualitative" }] });
        // false indicates quantitative stat (no max, has unit)
        else onChange({ ...data, stats: [...stats, { unit1: '', value: 0, type: "quantitative" }] });
    };

    const removeStat = (index) => {
        onChange({ ...data, stats: stats.filter((_, i) => i !== index) });
    };

    if (stats.length === 0 && !editing) return null;

    const quantCount = stats.filter(s => s.type === 'quantitative').length;

    return (
        <div className="stats-module" ref={!editing ? cardRef : null}>
            <p className="divider-header">Stats</p>
            {editing && (
          <p className="about-edit-help">
            Enter any quantitative stats (ex. 45 member) or qualitative stats (ex. 3.5/4 avg GPA )
          </p>
        )}
            {editing && warning && <p className="module-warning">{warning}</p>}
         {editing ? (
                <div className="rendered-part">
                 {/* Quantitative edit — value, unit, remove */}
<div className="quant-stats">
    {stats.map((stat, index) => stat.type !== "quantitative" ? null : (() => {
        // Calculate color based on its position among OTHER quantitative stats
        const quantIndex = stats.slice(0, index).filter(s => s.type === 'quantitative').length;
        const color = STAT_COLORS[quantIndex % STAT_COLORS.length];
        
        return (
            <div
    className={`quant-stat-holder ${editing ? "editing" : ""}`}
    key={index}
>
                {/* NEW: Horizontal flex wrapper for inputs */}
                <div className="quant-inputs-row">
                    <label>
                        <input
                            className="number-big edit-mode-input"
                            type="number"
                            style={{ color }}
                            step={1}
                            value={stat.value}
                            onChange={(e) => updateStat(index, 'value', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        />
                    </label>
                    <div className="combined-unit">
                        <label>
                            <input
                                className="edit-mode-input"
                                type="text"
                                style={{ color }}
                                placeholder="Stat Name"
                                maxLength={10}
                                value={stat.unit1 || ''}
                                onChange={(e) => updateStat(index, 'unit1', e.target.value)}
                            /> 
                        </label>
                    </div>
                </div>

                {/* The remove button naturally falls below the row container */}
                <button
                    className="stats-remove-btn"
                    onClick={() => removeStat(index)}
                    aria-label="Remove stat"
                >
                    ✕
                </button>
            </div>
        );
    })())}
 

                        <button
                            className="stats-add-btn"
                            onClick={() => addStat(false)}
                            disabled={stats.length >= 8}
                        >
                            + QUANTITATIVE {stats.length >= 8 ? '(limit reached)' : `  (${stats.length}/8)`}
                        </button>
                    </div>

                    {/* Qualitative edit — value, max, label, slider, remove */}
                    <div className="qual-stats">
                        {stats.map((stat, index) => stat.type !== "qualitative" ? null : (() => {
                            // Calculate color based on total quant stats + its position among qualitative stats
                            const qualIndex = stats.slice(0, index).filter(s => s.type === 'qualitative').length;
                            const color = STAT_COLORS[(quantCount + qualIndex) % STAT_COLORS.length];
                            
                            return (
                                <div key={index}>
                                    <div className="vert-flex">
                                        <div className="">
                                            <label className="">
                                                <input
                                                    className="number-big edit-mode-input"
                                                    type="number"
                                                    style={{ color }}
                                                    max={stat.max ?? 10}
                                                    step={1}
                                                    value={stat.value}
                                                    onChange={(e) => updateStat(index, 'value', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                                                />
                                            </label>
                                            <label className="">
                                            <span style={{ paddingLeft: "5px", paddingRight: "5px" }}>/</span>
                                                <input
                                                    className="number-small edit-mode-input"
                                                    type="number"
                                                    style={{ color }}
                                                    step={1}
                                                    value={stat.max ?? 10}
                                                    onChange={(e) => updateStat(index, 'max', e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                                                />
                                            </label>
                                            <label className="stat-name-input-label">
                                                <input
                                                    className="range-label edit-mode-input"
                                                    type="text"
                                                    placeholder="Stat name"
                                                    maxLength={30}
                                                    value={stat.label}
                                                    onChange={(e) => updateStat(index, 'label', e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="sliderContainer">
                                        <button
                                            className="stats-remove-btn"
                                            onClick={() => removeStat(index)}
                                            aria-label="Remove stat"
                                        >
                                            ✕
                                        </button>
                                        <input
                                            className="slider"
                                            type="range"
                                            min="0"
                                            max={stat.max}
                                            step="1"
                                            value={stat.value}
                                            onChange={(e) => updateStat(index, 'value', parseInt(e.target.value) || 0)}
                                            style={{
                                                background: fill(color, 0, stat.max, stat.value),
                                                boxShadow: `0 0 0 1px #adadad`
                                            }}
                                        />
                                        
                                    </div>
                                </div>
                            );
                        })())}
                        <button
                            className="stats-add-btn"
                            onClick={() => addStat(true)}
                            disabled={stats.length >= 8}
                        >
                            + QUALITATIVE {stats.length >= 8 ? '(limit reached)' : `(${stats.length}/8)`}
                        </button>
                    </div>
                </div>
        
            
               ) : (
                // View Mode
                <div>
                    {/* Quantitative view — number + unit side-by-side */}
                    <div className="quant-stats">
                        {stats.filter(s => s.type === "quantitative").map((stat, index) => {
                            const value = parseInt(Number(stat.value).toFixed(1)) || 0;
                            const color = STAT_COLORS[index % STAT_COLORS.length];
                            return (
                                <div className="quant-stat-holder" key={index}>
                                    {/* Use the same horizontal flex row from edit mode */}
                                    <div className="quant-inputs-row" style={{ alignItems: 'flex-end', gap: '6px' }}>
                                        <p className="number-big" style={{ color, width: 'auto', margin: 0, lineHeight: '0.85' }}>
                                            <CountUp target={value} animate={animated} delay={index * 120} />
                                        </p>
                                        <span className="stat-label" style={{ color, marginBottom: '-3px' }}>
                                            {stat.unit1}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Qualitative view — bar + number/max */}
                    <div className="qual-stats">
                        {stats.filter(s => s.type === "qualitative").map((stat, index) => {
                            const value = parseInt(Number(stat.value).toFixed(1)) || 0;
                            const color = STAT_COLORS[(quantCount + index) % STAT_COLORS.length];
                            const max = stat.max ?? 10;
                            const barPct = Math.min((value / max) * 100, 100);
                            return (
                                <div className="range-row" key={index}>
                                    <div className="vert-flex">
                                        <p className="number-big" style={{ color, margin: 0 }}>
                                            <CountUp target={value} animate={animated} delay={index * 120} />
                                            <span className="number-small" style={{ color }}>/{stat.max}</span>
                                        </p>
                                        <span className="stat-label">{stat.label}</span>
                                    </div>
                                    <div className="range-bar-container">
                                        <div
                                            className={`${stat.value !== stat.max ? 'range-bar-partial': 'range-bar-fill'}`}
                                            style={{
                                                width: animated ? `${barPct}%` : '0%',
                                                backgroundColor: color,
                                                transition: `width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 120}ms`,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default React.memo(StatsModule);
