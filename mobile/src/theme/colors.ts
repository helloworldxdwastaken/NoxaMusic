// NOXA Music - Theme matching web app exactly
export const colors = {
  // Backgrounds - matching web CSS variables
  bgBase: '#0a0a0a',
  bgElevated: '#1a1a1a',
  bgHighlight: '#2a2a2a',
  bgPress: '#333333',
  bgCard: '#1a1a1a',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#b3b3b3',
  textSubdued: '#6a6a6a',
  
  // Accents - Spotify Green
  accentGreen: '#1db954',
  accentGreenHover: '#1ed760',
  accentRed: '#ff3b30',
  accentBlue: '#0a84ff',
  
  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.1)',
  borderMedium: 'rgba(255, 255, 255, 0.15)',
  
  // Status
  success: '#1db954',
  error: '#ff3b30',
  warning: '#ffa500',
  
  // Glass effects
  glassBackground: 'rgba(26, 26, 26, 0.8)',
  glassElevated: 'rgba(40, 40, 40, 0.9)',
} as const;

export type ColorKey = keyof typeof colors;
