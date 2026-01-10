// Spotify-like Dark Theme matching web app
export const colors = {
  // Backgrounds
  bgBase: '#000000',
  bgElevated: '#121212',
  bgHighlight: '#1a1a1a',
  bgPress: '#282828',
  bgCard: '#161621',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#b3b3b3',
  textSubdued: '#6a6a6a',
  
  // Accents - Spotify Green
  accentGreen: '#1db954',
  accentGreenHover: '#1ed760',
  accentRed: '#e22134',
  
  // Borders
  borderSubtle: '#282828',
  
  // Status
  success: '#1db954',
  error: '#ff6b6b',
  warning: '#ffa500',
} as const;

export type ColorKey = keyof typeof colors;


