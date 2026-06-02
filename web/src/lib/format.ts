const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;

  return `${numberFormatter.format(Number(value.toFixed(decimals)))} ${units[exponent]}`;
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatCount(value: number) {
  return numberFormatter.format(value);
}

export function formatRelativeDays(days: number) {
  return `${numberFormatter.format(days)} روز`;
}
