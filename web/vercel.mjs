const normalize = (value) => String(value || '').trim().replace(/\/+$/, '');
const hinovaBaseUrl = normalize(process.env.HINOVA_RENDER_URL);

if (!hinovaBaseUrl) {
  throw new Error('Configure HINOVA_RENDER_URL no projeto da Vercel antes do deploy.');
}

export const config = {
  framework: null,
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  cleanUrls: false,
  rewrites: [
    {
      source: '/api/consultar-boletos-associado',
      destination: `${hinovaBaseUrl}/api/consultar-boletos-associado`
    },
    {
      source: '/api/baixar-boleto',
      destination: `${hinovaBaseUrl}/api/baixar-boleto`
    }
  ],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' }
      ]
    },
    {
      source: '/shared/config.js',
      headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }]
    }
  ]
};
