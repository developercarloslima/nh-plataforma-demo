(() => {
  'use strict';

  const normalizeLabel = (value, index) => {
    const label = String(value || '').replace(/\s+/g, ' ').trim();
    return label || `Campo ${index + 1}`;
  };

  const enhanceRow = (row, headers) => {
    if (!(row instanceof HTMLTableRowElement)) return;

    const cells = Array.from(row.cells || []);
    if (!cells.length) return;

    const isFullRow = cells.length === 1 && Number(cells[0].colSpan || 1) > 1;

    cells.forEach((cell, index) => {
      if (!(cell instanceof HTMLTableCellElement) || cell.tagName !== 'TD') return;

      if (isFullRow || cell.hasAttribute('colspan')) {
        cell.dataset.fullRow = 'true';
        cell.removeAttribute('data-label');
        return;
      }

      const label = normalizeLabel(headers[index], index);
      cell.dataset.label = label;
      if (!cell.getAttribute('aria-label')) cell.setAttribute('aria-label', label);
    });
  };

  const enhanceTable = (table) => {
    if (!(table instanceof HTMLTableElement)) return;

    table.classList.add('responsive-table');

    const headers = Array.from(table.querySelectorAll('thead th')).map((header, index) =>
      normalizeLabel(header.textContent, index)
    );

    table.querySelectorAll('tbody tr').forEach((row) => enhanceRow(row, headers));
    table.dataset.responsiveReady = 'true';
  };

  const enhanceTables = (root = document) => {
    if (root instanceof HTMLTableElement) enhanceTable(root);
    root.querySelectorAll?.('table').forEach(enhanceTable);

    const ownerTable = root.closest?.('table');
    if (ownerTable) enhanceTable(ownerTable);
  };

  let scheduled = false;
  const scheduleEnhancement = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceTables(document);
    });
  };

  const start = () => {
    enhanceTables(document);

    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length || record.type === 'characterData')) {
        scheduleEnhancement();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('pageshow', scheduleEnhancement, { passive: true });
    window.addEventListener('orientationchange', scheduleEnhancement, { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
