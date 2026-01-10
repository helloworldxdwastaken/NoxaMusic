import { useCallback, useMemo } from 'react';

import { useThemeAccent } from '../context/ThemeContext';
import { hexToRgba } from '../utils/color';

export const useAccentColor = () => {
  const { accentOption } = useThemeAccent();

  const primary = accentOption.colors[0];
  const secondary = accentOption.colors[1] ?? primary;

  const primaryRgba = useCallback((alpha: number) => hexToRgba(primary, alpha), [primary]);

  return useMemo(
    () => ({
      accentOption,
      primary,
      secondary,
      isGradient: accentOption.colors.length > 1,
      onPrimary: accentOption.onPrimary,
      primaryRgba,
    }),
    [accentOption, primary, secondary, primaryRgba],
  );
};
