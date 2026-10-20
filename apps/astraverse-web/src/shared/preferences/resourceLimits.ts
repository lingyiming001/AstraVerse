export const DEFAULT_RESOURCE_LIMIT_MB = 50;
export const MAX_RESOURCE_LIMIT_MB = 2048;
export const validResourceLimit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_RESOURCE_LIMIT_MB;
export const normalizeResourceLimit = (value: unknown) =>
  validResourceLimit(value) ? value : DEFAULT_RESOURCE_LIMIT_MB;
export const resourceLimitBytes = (value: unknown) => normalizeResourceLimit(value) * 1024 * 1024;
