# Tableloom website

The standalone site for https://tableloom.cc. GitHub Pages publishes this branch from its root.

Edit `index.html`, `style.css`, and `site.js`, then push `gh-pages`. Keep `CNAME` set to `tableloom.cc`. The site uses local fonts and images; no build step is required. Download links have working release fallbacks and refresh from the public GitHub Releases API.

The desktop application lives on `main`. The website uses the supplied Tableloom showcase design.

`analytics.js` uses the dedicated Tableloom GA4 stream (`G-B25438YE7K`). Google Analytics loads only after consent and is disabled in local previews. It measures page visits and `download_click` events. Keep the Search Console verification meta tag in `index.html`; removing it can revoke the site's verified status. `privacy.html` explains the website's data use.
