import isEmpty from "lodash/isEmpty.js";

function pushField({ row, field }) {
  row.push(field.value);
  field.value = "";
}

function pushRow({ rows, row, field }) {
  pushField({ row, field });
  if (row.length === 1 && row[0] === "") {
    row.length = 0;
    return;
  }
  rows.push([...row]);
  row.length = 0;
}

function tokenize(text, delimiter) {
  const rows = [];
  const row = [];
  const field = { value: "" };
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        const next = text[i + 1];
        if (next === "\"") {
          field.value += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field.value += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      pushField({ row, field });
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      pushRow({ rows, row, field });
      continue;
    }

    field.value += char;
  }

  pushField({ row, field });
  if (row.length > 0) {
    rows.push([...row]);
  }

  return rows.filter((current) => current.some((value) => value.trim() !== ""));
}

export function parseCSV(text, { delimiter = ",", trim = true, headers = true } = {}) {
  if (typeof text !== "string") {
    throw new TypeError("parseCSV expects a string input");
  }

  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const rows = tokenize(cleaned, delimiter);
  if (!headers) {
    return rows.map((row) => row.map((value) => (trim ? value.trim() : value)));
  }

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((value) => (trim ? value.trim() : value));
  const remaining = rows.slice(1);

  if (isEmpty(header)) {
    return [];
  }

  return remaining.map((row) => {
    const record = {};
    header.forEach((key, index) => {
      const value = row[index] ?? "";
      record[key] = trim && typeof value === "string" ? value.trim() : value;
    });
    return record;
  });
}

export default parseCSV;
