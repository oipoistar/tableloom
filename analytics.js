(() => {
  const measurementId = 'G-B25438YE7K';
  const preferenceKey = 'tableloom-analytics-consent';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const notice = document.querySelector('.cookie-notice');
  const production = location.hostname === 'tableloom.cc' || location.hostname === 'www.tableloom.cc';
  let loaded = false;
  let consent = readConsent();

  function readConsent() {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey));
      return saved && saved.expires > Date.now() && ['granted', 'denied'].includes(saved.value)
        ? saved.value : null;
    } catch { return null; }
  }

  function clearAnalyticsCookies() {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (name !== '_ga' && !name.startsWith('_ga_')) continue;
      for (const domain of ['', location.hostname, '.tableloom.cc']) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
      }
    }
  }

  function loadAnalytics() {
    if (loaded || consent !== 'granted' || !production) return;
    loaded = true;
    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* Ignore an invalid referrer. */ }
    window.gtag('config', measurementId, {
      page_location: location.origin + location.pathname,
      page_referrer: referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: lifetime / 1000,
      cookie_domain: 'tableloom.cc',
      cookie_flags: 'SameSite=Lax;Secure',
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
  }

  function applyConsent(value) {
    consent = value;
    if (notice) notice.hidden = value !== null;
    if (value === 'granted') {
      loadAnalytics();
    } else {
      window[`ga-disable-${measurementId}`] = true;
      clearAnalyticsCookies();
      // Unload Google's runtime when an existing choice is withdrawn.
      if (loaded) location.reload();
    }
  }

  document.querySelectorAll('[data-consent]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.consent;
      try { localStorage.setItem(preferenceKey, JSON.stringify({ value, expires: Date.now() + lifetime })); } catch { /* Apply for this visit if storage is unavailable. */ }
      applyConsent(value);
    });
  });
  document.querySelectorAll('.cookie-settings').forEach((button) => {
    button.addEventListener('click', () => {
      if (!notice) return;
      notice.hidden = false;
      notice.querySelector('button').focus();
    });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === preferenceKey || event.key === null) applyConsent(readConsent());
  });
  document.querySelectorAll('[data-download]').forEach((link) => {
    link.addEventListener('click', () => {
      if (consent !== 'granted' || !loaded) return;
      const url = new URL(link.href);
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/oipoistar/tableloom/releases/download/')) return;
      window.gtag('event', 'download_click', {
        download_type: link.dataset.download,
        file_name: url.pathname.split('/').pop(),
        link_url: url.origin + url.pathname,
        transport_type: 'beacon',
      });
    });
  });
  applyConsent(consent);
})();
