import React from 'react';

export function Table({
  columns = [],
  rows = [],
  rowKey = 'id',
  caption,
  emptyMessage = 'No data available',
  className = '',
  striped = false,
  hoverable = true,
  'aria-label': ariaLabel,
}) {
  return (
    <div className={`ts-table-container ${className}`} role="region" aria-label={ariaLabel} tabIndex={0}>
      {caption && (
        <caption className="ts-table-caption">{caption}</caption>
      )}
      <table className={`ts-table ${striped ? 'ts-table-striped' : ''} ${hoverable ? 'ts-table-hoverable' : ''}`} role="grid">
        <thead>
          <tr role="row">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width, textAlign: column.align }}
                aria-sort={column.sortable ? 'none' : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ts-table-empty" style={{ textAlign: 'center', padding: 'var(--ts-space-8)', color: 'var(--ts-ink-muted)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const key = typeof rowKey === 'function'
                ? rowKey(row, rowIndex)
                : (row?.[rowKey] ?? rowIndex);
              return (
                <tr key={key} role="row">
                  {columns.map((column) => (
                    <td key={column.key || `col-${column.header}`} style={{ textAlign: column.align, width: column.width }}>
                      {column.render
                        ? column.render(row || {}, rowIndex, row?.[column.key])
                        : (row?.[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;