import React from 'react';
import { Link } from 'react-router-dom';

/** Breadcrumb trail. Items: [{ label, to? }] — last item is current page. */
export function Breadcrumb({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="ts-breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? <span className="sep" aria-hidden="true">/</span> : null}
            {isLast || !item.to ? (
              <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            ) : (
              <Link to={item.to}>{item.label}</Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
