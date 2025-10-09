import cloneDeep from "lodash/cloneDeep.js";
import isEmpty from "lodash/isEmpty.js";
import * as turf from "@turf/turf";
import { featureCollection, polygon } from "@turf/helpers";
import { parseCSV } from "./csv.js";

const GEOJSON_TYPES = new Set(["FeatureCollection", "Feature", "GeometryCollection", "Polygon", "MultiPolygon"]);

const DEFAULT_GRID_OPTIONS = {
  rowField: "row",
  colField: "col",
  idField: "id",
  includeSourceProperties: true,
  cellPadding: 0.08,
  rowOrientation: "top",
  colOrientation: "left",
};

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 0.49) return 0.49;
  return value;
};

export const isGeoJSON = (input) => {
  if (!input || typeof input !== "object") return false;
  if (typeof input.type !== "string") return false;
  return GEOJSON_TYPES.has(input.type);
};

function ensureExtent({ extent, regularGeoJSON }) {
  if (Array.isArray(extent) && extent.length === 4) {
    const [minX, minY, maxX, maxY] = extent.map((value) => Number(value));
    if ([minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) {
      return [minX, minY, maxX, maxY];
    }
  }

  if (regularGeoJSON && isGeoJSON(regularGeoJSON)) {
    const bounds = turf.bbox(regularGeoJSON);
    if (bounds && bounds.every((value) => Number.isFinite(value))) {
      return bounds;
    }
  }

  throw new Error("Unable to determine extent for grid cartogram. Provide `cartogramGridOptions.extent` or a valid regularGeoJSON.");
}

const ORIENTATIONS = {
  row: new Set(["top", "bottom"]),
  col: new Set(["left", "right"]),
};

function normalizeOptions(joinProperty, overrides = {}) {
  const base = { ...DEFAULT_GRID_OPTIONS, idField: joinProperty ?? DEFAULT_GRID_OPTIONS.idField };
  const merged = { ...base, ...overrides };

  if (!ORIENTATIONS.row.has(merged.rowOrientation)) {
    merged.rowOrientation = DEFAULT_GRID_OPTIONS.rowOrientation;
  }

  if (!ORIENTATIONS.col.has(merged.colOrientation)) {
    merged.colOrientation = DEFAULT_GRID_OPTIONS.colOrientation;
  }

  merged.cellPadding = clamp01(merged.cellPadding);

  return merged;
}

function normalizeRecords(records, { rowField, colField, idField }) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Grid cartogram input is empty");
  }

  return records.map((record, index) => {
    const source = record ?? {};
    const idValue = source[idField];
    if (idValue == null || idValue === "") {
      throw new Error(`Grid cartogram row ${index} is missing identifier column "${idField}"`);
    }

    const rowRaw = source[rowField];
    const colRaw = source[colField];

    const row = Number(rowRaw);
    const col = Number(colRaw);

    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      throw new Error(
        `Grid cartogram row ${index} must contain numeric "${rowField}" and "${colField}" values`
      );
    }

    return {
      id: idValue,
      row,
      col,
      source,
    };
  });
}

function deriveGridMetrics(entries) {
  const rows = entries.map((entry) => entry.row);
  const cols = entries.map((entry) => entry.col);

  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  const rowCount = maxRow - minRow + 1;
  const colCount = maxCol - minCol + 1;

  if (!Number.isFinite(rowCount) || rowCount <= 0 || !Number.isFinite(colCount) || colCount <= 0) {
    throw new Error("Invalid row/column range detected in grid cartogram input");
  }

  return {
    minRow,
    maxRow,
    minCol,
    maxCol,
    rowCount,
    colCount,
  };
}

function computeCellBounds({
  entry,
  metrics,
  extent,
  options,
}) {
  const [minX, minY, maxX, maxY] = extent;
  const width = maxX - minX;
  const height = maxY - minY;

  const cellWidth = width / metrics.colCount;
  const cellHeight = height / metrics.rowCount;

  const padX = cellWidth * options.cellPadding;
  const padY = cellHeight * options.cellPadding;

  const innerWidth = cellWidth - padX;
  const innerHeight = cellHeight - padY;

  const colIndex = entry.col - metrics.minCol;
  const rowIndex = entry.row - metrics.minRow;

  if (options.colOrientation === "left") {
    const x0 = minX + colIndex * cellWidth + padX / 2;
    const x1 = x0 + innerWidth;

    if (options.rowOrientation === "top") {
      const y1 = maxY - rowIndex * cellHeight - padY / 2;
      const y0 = y1 - innerHeight;
      return { x0, x1, y0, y1 };
    }

    const y0 = minY + rowIndex * cellHeight + padY / 2;
    const y1 = y0 + innerHeight;
    return { x0, x1, y0, y1 };
  }

  const x1 = maxX - colIndex * cellWidth - padX / 2;
  const x0 = x1 - innerWidth;

  if (options.rowOrientation === "top") {
    const y1 = maxY - rowIndex * cellHeight - padY / 2;
    const y0 = y1 - innerHeight;
    return { x0, x1, y0, y1 };
  }

  const y0 = minY + rowIndex * cellHeight + padY / 2;
  const y1 = y0 + innerHeight;
  return { x0, x1, y0, y1 };
}

function createSquareFeature({ entry, bounds, joinProperty, options }) {
  const { x0, x1, y0, y1 } = bounds;
  const ring = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];

  const baseProperties = options.includeSourceProperties ? cloneDeep(entry.source) : {};

  const properties = {
    ...baseProperties,
    [joinProperty]: entry.id,
    grid_row: entry.row,
    grid_col: entry.col,
  };

  if (typeof options.propertyMapper === "function") {
    const extra = options.propertyMapper({
      source: entry.source,
      joinValue: entry.id,
      row: entry.row,
      col: entry.col,
    });
    if (extra && typeof extra === "object") {
      Object.assign(properties, extra);
    }
  }

  return {
    type: "Feature",
    id: entry.id,
    properties,
    geometry: polygon([ring]).geometry,
  };
}

export function createGridCartogramFeatureCollection({
  records,
  regularGeoJSON,
  joinProperty = "code",
  gridOptions = {},
}) {
  const options = normalizeOptions(joinProperty, gridOptions);
  const extent = ensureExtent({ extent: options.extent, regularGeoJSON });

  const entries = normalizeRecords(records, options);
  const metrics = deriveGridMetrics(entries);

  const features = entries.map((entry) => {
    const bounds = computeCellBounds({ entry, metrics, extent, options });
    return createSquareFeature({ entry, bounds, joinProperty, options });
  });

  return featureCollection(features);
}

export function normalizeCartogramInput({
  input,
  regularGeoJSON,
  joinProperty = "code",
  gridOptions = {},
}) {
  if (!input) {
    throw new Error("Cartogram input is required");
  }

  if (isGeoJSON(input)) {
    return cloneDeep(input);
  }

  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new Error("Cartogram input array is empty");
    }
    if (input[0] && typeof input[0] === "object" && !Array.isArray(input[0])) {
      return createGridCartogramFeatureCollection({
        records: input,
        regularGeoJSON,
        joinProperty,
        gridOptions,
      });
    }
    throw new Error("Unsupported cartogram array format. Provide objects with row/col values.");
  }

  if (typeof input === "string") {
    const records = parseCSV(input);
    if (isEmpty(records)) {
      throw new Error("Parsed cartogram CSV is empty");
    }
    return createGridCartogramFeatureCollection({
      records,
      regularGeoJSON,
      joinProperty,
      gridOptions,
    });
  }

  if (input && typeof input === "object" && Array.isArray(input.records)) {
    return createGridCartogramFeatureCollection({
      records: input.records,
      regularGeoJSON,
      joinProperty,
      gridOptions,
    });
  }

  throw new Error("Unsupported cartogram input format");
}

export default normalizeCartogramInput;
