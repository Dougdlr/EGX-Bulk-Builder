module.exports = {
  darkMode: 'class',
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {
    fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    colors: { egx: { bg: '#0B0F19', panel: '#0F172A', card: '#1E293B', border: '#334155' } }
  } }
};
