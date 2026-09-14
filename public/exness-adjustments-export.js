(async () => {
  const MAX_LOAD_MORE_CLICKS = 200;
  const OUTPUT_HEADERS = [
    "Symbol",
    "Type",
    "Lots",
    "Position ID",
    "Ex-date",
    "Adjustment day",
    "Adjustment date",
    "Dividend rate",
    "Adjustment"
  ];

  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();

  const cellText = node => {
    const raw = node?.innerText ?? node?.textContent ?? "";
    return clean(raw) || clean(node?.getAttribute?.("aria-label") || "");
  };

  const normalise = value =>
    clean(value)
      .toLowerCase()
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/\s*-\s*/g, "-");

  const isVisible = element => {
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  };

  const cellsIn = row => {
    const direct = [...row.children];

    const semanticCells = direct.filter(element =>
      /^(TD|TH)$/.test(element.tagName)
    );
    if (semanticCells.length) return semanticCells;

    const roleCells = direct.filter(element =>
      /^(gridcell|cell|columnheader)$/.test(
        element.getAttribute("role") || ""
      )
    );
    if (roleCells.length) return roleCells;

    return direct.filter(element => !/^(SCRIPT|STYLE)$/.test(element.tagName));
  };

  const rowsIn = root => {
    const tableRows = [...root.querySelectorAll("tr")];
    if (tableRows.length) return tableRows;

    return [...root.querySelectorAll('[role="row"]')];
  };

  const keyForHeader = header => {
    const value = normalise(header);

    if (value === "symbol") return "Symbol";
    if (value === "type") return "Type";
    if (value === "lots") return "Lots";
    if (value === "position-id" || value === "position id") {
      return "Position ID";
    }
    if (value === "ex-date" || value === "ex date") return "Ex-date";
    if (value === "adjustment-date" || value === "adjustment date") {
      return "Adjustment date";
    }
    if (value === "dividend-rate" || value === "dividend rate") {
      return "Dividend rate";
    }
    if (value === "adjustment") return "Adjustment";

    return "";
  };

  const parseGrid = root => {
    const rows = rowsIn(root);

    const headerIndex = rows.findIndex(row => {
      const headers = cellsIn(row).map(cellText);
      return (
        headers.some(header => keyForHeader(header) === "Adjustment") &&
        headers.some(header => keyForHeader(header) === "Adjustment date")
      );
    });

    if (headerIndex === -1) return null;

    const headers = cellsIn(rows[headerIndex]).map(header =>
      keyForHeader(cellText(header))
    );

    if (!headers.includes("Adjustment")) return null;

    const data = [];

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsIn(row);
      if (cells.length < headers.length) continue;

      const item = {};

      headers.forEach((header, index) => {
        if (header) item[header] = cellText(cells[index]);
      });

      if (item.Adjustment && item["Adjustment date"]) {
        data.push(item);
      }
    }

    return {
      data,
      visible: isVisible(root)
    };
  };

  const extractRows = () => {
    const roots = [
      ...new Set(
        document.querySelectorAll(
          'table, [role="table"], [role="grid"]'
        )
      )
    ];

    const parsed = roots
      .map(root => {
        const result = parseGrid(root);
        return result ? { ...result, root } : null;
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.data.length - a.data.length ||
          Number(b.visible) - Number(a.visible)
      );

    return parsed[0]?.data || [];
  };

  const rowSignature = row =>
    OUTPUT_HEADERS
      .filter(header => header !== "Adjustment day")
      .map(header => row[header] ?? "")
      .join("\u001f");

  const findLoadMore = () =>
    [...document.querySelectorAll('button, [role="button"], a')].find(
      element =>
        isVisible(element) &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true" &&
        /load\s+more/i.test(cellText(element))
    );

  const delay = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds));

  const collected = new Map();

  const remember = rows => {
    for (const row of rows) {
      collected.set(rowSignature(row), row);
    }
  };

  remember(extractRows());

  for (
    let clickCount = 0;
    clickCount < MAX_LOAD_MORE_CLICKS;
    clickCount++
  ) {
    const button = findLoadMore();
    if (!button) break;

    const before = extractRows();
    const beforeSignatures = new Set(before.map(rowSignature));

    try {
      button.click();
    } catch (error) {
      console.warn("Could not click Load more:", error);
      break;
    }

    let after = before;
    let changed = false;

    for (let attempt = 0; attempt < 40; attempt++) {
      await delay(200);
      after = extractRows();

      const afterSignatures = new Set(after.map(rowSignature));
      changed =
        after.length !== before.length ||
        [...afterSignatures].some(
          signature => !beforeSignatures.has(signature)
        );

      if (changed) break;
    }

    remember(after);

    if (!changed) break;
  }

  const adjustmentDay = value =>
    clean(value)
      .replace(
        /\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s+[A-Za-z]{2,6})?\s*$/,
        ""
      )
      .trim();

  const rows = [...collected.values()];

  if (!rows.length) {
    throw new Error(
      "No dividend rows were found. Make sure the Dividends table is visible."
    );
  }

  const csvEscape = value =>
    `"${clean(value).replace(/"/g, '""')}"`;

  const csvRows = [
    OUTPUT_HEADERS,
    ...rows.map(row => [
      row.Symbol,
      row.Type,
      row.Lots,
      row["Position ID"],
      row["Ex-date"],
      adjustmentDay(row["Adjustment date"]),
      row["Adjustment date"],
      row["Dividend rate"],
      row.Adjustment
    ])
  ];

  const csv = csvRows
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n");

  window.__exnessAdjustmentsCSV = csv;

  let copied = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(csv);
      copied = true;
    }
  } catch (_) {
    // Use the fallback below.
  }

  if (!copied) {
    const textarea = document.createElement("textarea");
    textarea.value = csv;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      copied = document.execCommand("copy");
    } catch (_) {
      copied = false;
    }

    textarea.remove();
  }

  const fileName =
    `exness-adjustments-${new Date().toISOString().slice(0, 10)}.csv`;

  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  console.log(
    `Exported ${rows.length} adjustment rows.`,
    copied ? "CSV copied to clipboard." : "Clipboard copy failed."
  );
  console.log(`CSV is also available as window.__exnessAdjustmentsCSV`);
  console.table(rows);
})();
