export type StorageHealthLevel = "unknown" | "ok" | "warning" | "critical";

export interface StorageHealth {
  level: StorageHealthLevel;
  label: string;
  detail: string;
  usage?: number;
  quota?: number;
  usageRatio?: number;
}

export function summarizeStorageEstimate(
  estimate: Pick<StorageEstimate, "usage" | "quota"> | undefined
): StorageHealth {
  const usage = estimate?.usage;
  const quota = estimate?.quota;

  if (!isUsableByteValue(usage) || !isUsableByteValue(quota) || quota <= 0) {
    return {
      level: "unknown",
      label: "Storage usage unavailable.",
      detail: "Browser storage estimate is unavailable."
    };
  }

  const usageRatio = Math.min(1, Math.max(0, usage / quota));
  const percent = Math.round(usageRatio * 100);

  return {
    level: storageHealthLevel(usageRatio),
    label: `${formatBytes(usage)} / ${formatBytes(quota)} (${percent}%)`,
    detail: storageHealthDetail(usageRatio),
    usage,
    quota,
    usageRatio
  };
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const rounded = size >= 10 || unitIndex === 0 ? Math.round(size).toString() : size.toFixed(1);

  return `${rounded} ${units[unitIndex]}`;
}

function storageHealthLevel(usageRatio: number): StorageHealthLevel {
  if (usageRatio >= 0.9) {
    return "critical";
  }

  if (usageRatio >= 0.75) {
    return "warning";
  }

  return "ok";
}

function storageHealthDetail(usageRatio: number): string {
  if (usageRatio >= 0.9) {
    return "Local browser storage is almost full. Export the vault or delete old raw archives before importing more data.";
  }

  if (usageRatio >= 0.75) {
    return "Local browser storage is getting high. Consider exporting the vault or pruning old raw archives soon.";
  }

  return "Local browser storage has enough available space for normal MVP usage.";
}

function isUsableByteValue(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
