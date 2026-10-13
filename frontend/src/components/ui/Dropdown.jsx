import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icons.jsx';

export function Dropdown({
  trigger,
  items = [],
  align = 'right',
  className = '',
  onSelect,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (item) => {
    onSelect?.(item);
    setIsOpen(false);
  };

  const alignStyles = {
    right: { right: 0, left: 'auto' },
    left: { left: 0, right: 'auto' },
  };

  return (
    <div className={`ts-dropdown ${className}`} ref={dropdownRef}>
      <div
        className="ts-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          className="ts-dropdown-menu"
          style={alignStyles[align] || alignStyles.right}
          role="menu"
        >
          {items.map((item, index) => (
            <button
              key={item.key || index}
              type="button"
              className="ts-dropdown-item"
              role="menuitem"
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              <span>{item.label}</span>
              {item.shortcut && <span className="ts-dropdown-shortcut">{item.shortcut}</span>}
            </button>
          ))}
          {items.length === 0 && (
            <div className="ts-dropdown-empty" role="status">
              No items available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dropdown;