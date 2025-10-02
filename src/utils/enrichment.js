import isEmpty from "lodash/isEmpty.js";
import cloneDeep from "lodash/cloneDeep.js";

export function groupByJoinColumn(data, joinColumn) {
  return data.reduce((groups, item) => {
    const key = item?.[joinColumn];
    if (!key) return groups;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function aggregateGroup(values, aggregations) {
  const result = {};
  for (const [column, type] of Object.entries(aggregations)) {
    const columnValues = values
      .map((item) => item?.[column])
      .filter((value) => value !== null && value !== undefined && value !== "");

    if (!columnValues.length) continue;

    switch (type) {
      case "sum":
        result[column] = columnValues.reduce((sum, val) => {
          const numeric = Number(val);
          return sum + (Number.isFinite(numeric) ? numeric : 0);
        }, 0);
        break;
      case "mean": {
        const numericValues = columnValues
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        if (numericValues.length) {
          result[column] =
            numericValues.reduce((acc, val) => acc + val, 0) /
            numericValues.length;
        }
        break;
      }
      case "count":
        result[column] = columnValues.length;
        break;
      case "unique_count":
        result[column] = new Set(columnValues).size;
        break;
      case "array":
        result[column] = Array.from(new Set(columnValues));
        break;
      case "categories": {
        columnValues.forEach((value) => {
          const key = `${column}_${value}`;
          result[key] = (result[key] || 0) + 1;
        });
        break;
      }
      case "min": {
        const numericValues = columnValues
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        if (numericValues.length) {
          result[column] = Math.min(...numericValues);
        }
        break;
      }
      case "max": {
        const numericValues = columnValues
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        if (numericValues.length) {
          result[column] = Math.max(...numericValues);
        }
        break;
      }
      default:
        break;
    }
  }

  return result;
}

export function normalizeAggregatedData(aggregated) {
  const numericKeys = new Set();
  Object.values(aggregated).forEach((values) => {
    Object.entries(values).forEach(([key, value]) => {
      if (Number.isFinite(value)) numericKeys.add(key);
    });
  });

  const ranges = {};
  numericKeys.forEach((key) => {
    const numericValues = Object.values(aggregated)
      .map((values) => values[key])
      .filter((value) => Number.isFinite(value));
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    ranges[key] = { min, max };
  });

  return Object.entries(aggregated).reduce((acc, [code, values]) => {
    const normalized = { ...values };
    for (const key of numericKeys) {
      const value = values[key];
      if (!Number.isFinite(value)) continue;
      const { min, max } = ranges[key];
      normalized[key] = min === max ? 0.5 : (value - min) / (max - min);
    }
    acc[code] = normalized;
    return acc;
  }, {});
}

export function enrichGeoData({
  data,
  geojson,
  joinColumn = "lsoa",
  geoJSONJoinColumn = "code",
  aggregations = {},
  normalize = true,
}) {
  if (!Array.isArray(data) || isEmpty(data)) {
    return geojson;
  }

  if (!geojson?.features?.length) {
    return geojson ?? { type: "FeatureCollection", features: [] };
  }

  const groups = groupByJoinColumn(data, joinColumn);
  const aggregated = Object.entries(groups).reduce((acc, [code, values]) => {
    acc[code] = aggregateGroup(values, aggregations);
    return acc;
  }, {});

  const finalAggregated = normalize
    ? normalizeAggregatedData(aggregated)
    : aggregated;

  const enriched = cloneDeep(geojson);
  enriched.features = enriched.features.map((feature) => {
    const joinValue = feature?.properties?.[geoJSONJoinColumn];
    if (!joinValue) return feature;

    const extra = finalAggregated[joinValue];
    if (!extra) return feature;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        ...extra,
      },
    };
  });

  return enriched;
}

export function createLookup(features, keyAccessor) {
  return features.reduce((acc, feature) => {
    const key = keyAccessor(feature);
    if (!key) return acc;
    acc[key] = feature;
    return acc;
  }, {});
}
