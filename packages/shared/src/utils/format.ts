/** Formatting helpers shared by the inspector, the plan dimensions and the exported PNG. */

const metersFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const areaFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const centimetersFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

export function formatMeters(value: number): string {
  return `${metersFormatter.format(value)} m`;
}

export function formatCentimeters(value: number): string {
  return `${centimetersFormatter.format(value * 100)} cm`;
}

export function formatArea(value: number): string {
  return `${areaFormatter.format(value)} m²`;
}

export function formatDegrees(radians: number): string {
  const degrees = Math.round(((radians * 180) / Math.PI) % 360);
  return `${degrees}°`;
}

/** Compact dimension label used on plan edges, e.g. `3,40`. */
export function formatDimension(value: number): string {
  return metersFormatter.format(value);
}

export function parseMeters(input: string): number | null {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}
