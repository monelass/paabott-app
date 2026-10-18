// Paabot brand theme — green & white
export const colors = {
  primary: '#0F9D58',      // core brand green
  primaryDark: '#0B7A43',  // pressed / headers
  primaryLight: '#E7F7EE', // tinted backgrounds, chips
  accent: '#34C777',       // highlights, active states
  white: '#FFFFFF',
  background: '#F7FBF9',
  surface: '#FFFFFF',
  text: '#12261C',
  textMuted: '#5B6E64',
  border: '#DCEEE3',
  danger: '#E5484D',
  warning: '#F2A93B',
  success: '#0F9D58',
  overlay: 'rgba(15, 157, 88, 0.08)',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.text },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text },
  h3: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  caption: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '600', color: colors.white },
};
