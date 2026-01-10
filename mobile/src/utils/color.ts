export const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.trim().replace('#', '');
  if (![3, 6].includes(sanitized.length)) {
    throw new Error('Invalid hex color');
  }
  const expanded = sanitized.length === 3 ? sanitized.split('').map(ch => ch + ch).join('') : sanitized;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if ([r, g, b].some(component => Number.isNaN(component))) {
    throw new Error('Invalid hex color');
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
