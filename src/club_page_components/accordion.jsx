import React, { useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './accordion.css';

export const MODULE_TITLES = {
  basic_info: 'About',
  links: 'Links',
  club_media: 'Media',
  join: 'How to Join',
  faqs: 'FAQs',
  stats: 'Stats',
  member_roster: 'Members',
  comments: 'Comments',
};

/**
 * Sortable accordion list for editable club page modules (including About; hero stays fixed above).
 *
 * @param {Array}    modules          - module objects from draft (sorted by order)
 * @param {Function} onReorder        - (reorderedModules) => void
 * @param {Function} onToggleDisplayed - (type) => void
 * @param {Function} renderContent    - (module) => ReactNode
 */
export default function ModuleAccordion({
  modules,
  onReorder,
  onToggleDisplayed,
  renderContent,
}) {
  const [openIds, setOpenIds] = useState([]);

  const toggleOpen = (id) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = modules.findIndex((item) => item.type === active.id);
    const newIndex = modules.findIndex((item) => item.type === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(modules, oldIndex, newIndex));
  };

  return (
    <>
      <p className="about-edit-help">
        Your club page is built from modules. Each section below is a part of what users see
        when they visit your page. Drag the handle to reorder, use the checkbox to show or hide a section, and click an accordionto expand and edit it. 
      </p>
      <div className="accordion">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={modules.map((m) => m.type)}
            strategy={verticalListSortingStrategy}
          >
            {modules.map((module) => (
              <SortableModule
                key={module.type}
                module={module}
                title={MODULE_TITLES[module.type] ?? module.type}
                isOpen={openIds.includes(module.type)}
                onToggleOpen={() => toggleOpen(module.type)}
                onToggleDisplayed={() => onToggleDisplayed(module.type)}
              >
                {renderContent(module)}
              </SortableModule>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}

function SortableModule({
  module,
  title,
  isOpen,
  onToggleOpen,
  onToggleDisplayed,
  children,
}) {
  const isDisplayed = module.isDisplayed !== false;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.type });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`item ${isOpen ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button type="button" className="header" onClick={onToggleOpen}>
        <div className="controls">
          <div
            className="drag-control"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="drag-handle">⋮⋮</span>
          </div>

          <label
            className="module-label"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isDisplayed}
              onChange={onToggleDisplayed}
            />
            <span
              className={`module-name ${!isDisplayed ? 'muted' : ''}`}
            >
              {title}
            </span>
          </label>
        </div>

        <span className="icon">+</span>
      </button>

      <div className="content">
        <div className="content-inner">{children}</div>
      </div>
    </div>
  );
}
