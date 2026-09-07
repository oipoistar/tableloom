# Tableloom website

The standalone site for https://tableloom.cc. GitHub Pages publishes this branch from its root.

Edit `index.html`, `style.css`, and `site.js`, then push `gh-pages`. Keep `CNAME` set to `tableloom.cc`. The site uses local fonts and images; no build step is required. Download links have working release fallbacks and refresh from the public GitHub Releases API.

The desktop application lives on `main`. The website uses the supplied Tableloom showcase design.

`analytics.js` uses the dedicated Tableloom GA4 stream (`G-B25438YE7K`). Google Analytics loads only after consent and is disabled in local previews. It measures page visits and `download_click` events. Keep the Search Console verification meta tag in `index.html`; removing it can revoke the site's verified status. `privacy.html` explains the website's data use.

Search metadata and structured data are embedded in the HTML, so they work without JavaScript. Keep the homepage canonical URL at `https://tableloom.cc/` and each page’s title and description specific to its content. The structured data describes the website and its open-source project; software review markup should only be added when real, visible reviews exist.

`sitemap.xml` lists public content pages. Update a page’s `lastmod` when its content changes, and add new public pages when they are published. Keep `404.html` out of the sitemap; GitHub Pages serves it with a 404 status. Check internal links, image dimensions, structured-data JSON, and the mobile layout before publishing.
