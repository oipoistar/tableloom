# Printing and destination fixtures

The home printer uses physical millimeters and quantities, with A4/Letter/custom paper, per-set imposition, explicit front/back IDs, and calibrated duplex mirroring. Keep print scaling at 100%.

The `Poker printing reference` resource is pinned at version `2026.9.7`: 63.5 × 88.9 mm trim, 3.175 mm bleed per edge, a conservative 3.175 mm internal safe margin, and 300 DPI PNGs (825 × 1125 pixels including bleed). It includes front/back templates and an offline export preset. It is a Tableloom reference, not manufacturer approval or an upload integration.

The finished poker size comes from [The Game Crafter’s playing-card page](https://www.thegamecrafter.com/make/custom-playing-cards). The bleed guidance comes from [its bleed documentation](https://help.thegamecrafter.com/article/391-bleed). The safe margin is our conservative preset choice. Sources checked 2026-09-07. Compare the latest product template before placing an order.

Native production output prints each unique component front/back on its own page, sets PDF trim and bleed boxes, merges mixed sizes, and invokes a separately installed Ghostscript 10.x converter using a user-chosen CMYK ICC profile. The output records its output intent and a settings sidecar. The test fixture used Ghostscript 10.07.1 and its generic default CMYK profile, solely to exercise conversion. Use the actual printer’s output profile for production.

Tests inspect PDF page counts, physical dimensions, embedded fonts, page boxes, CMYK output intent, and converter output. They do not replace an independent PDF/X validator or printer proof. Custom cut/fold/finish paths can be exported separately from artwork as geometry; named spot-color separations and industrial dieline tolerances need further prepress work.

TTS card output follows the [custom-card API](https://api.tabletopsimulator.com/custom-game-objects/), reserves the hidden sheet slot, preserves component/copy identities, and records a deck-structure hash. Structural tests pass. An installed TTS import fixture remains to be run.

Screentop output supplies raster sheets plus row/column metadata for the platform’s [asset model](https://screentop.gg/learn/basic-concepts). Upload and component setup remain manual. No remote publishing or game-sharing action is performed by Tableloom.
