(() => {
  const current = window.NH_CONFIG || {};
  const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
  const backendBaseUrl = normalizeBaseUrl(current.backendBaseUrl);

  window.NH_CONFIG = {
    sgaUrl: current.sgaUrl || '#',
    teamWhatsapp: current.teamWhatsapp || '',
    backendBaseUrl
  };

  window.NH_API = {
    backend(path) {
      const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
      return backendBaseUrl ? `${backendBaseUrl}${normalizedPath}` : normalizedPath;
    }
  };
})();
