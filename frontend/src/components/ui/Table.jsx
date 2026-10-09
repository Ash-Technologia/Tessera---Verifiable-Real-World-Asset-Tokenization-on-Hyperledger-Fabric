import React from 'react';

/**
 * Dense data table. Columns: [{ key, header, render?(row), align? }].
 * Render functions keep cell formatting local to the consuming page.
 */
export function Table({ columns = [], rows = [], rowKey, caption, emptyMessage = 'No rows to display.' }) {
  const keyFor = (row, index) => {
    if (typeof rowKey === 'function') return rowKey(row, index);
    if (rowKey && row && row[rowKey] !== undefined) return String(row[rowKey]);
    return `row-${index}`;
  };
  return (
    <div className="ts-table-wrap">
      <table className="ts-table">
        {caption ? <caption className="ts-metadata">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" style={col.align ? { textAlign: col.align } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ts-metadata">{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={keyFor(row, index)}>
                {columns.map((col) => (
                  <td key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                    {typeof col.render === 'function' ? col.render(row, index) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
