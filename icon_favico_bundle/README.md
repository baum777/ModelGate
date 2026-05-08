# Webapp Icon Bundle

Dieses Bundle enthält webapp-fertige Icons aus den gelieferten PNGs:

- `icons/light/` — Light-Mode Badge-Icons mit transparentem Außenbereich
- `icons/dark/` — Dark-Mode Badge-Icons mit transparentem Außenbereich
- `favicon/` — Favicon-Dateien mit vollständig transparentem Hintergrund, ohne Checkerboard und ohne großen Kreis-Background
- `source/` — bereinigte 2048px Master-Dateien
- `manifest-light.webmanifest` und `manifest-dark.webmanifest` — PWA-Manifest-Beispiele
- `html-head-snippet.html` — direkt nutzbarer HTML-Head-Ausschnitt

## Enthaltene Größen

App Icons: `16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024px`

Transparent Favicons: `16, 32, 48, 64, 96, 128, 256, 512px` plus `favicon-transparent.ico`.

Maskable PWA Icons: `192px` und `512px` pro Theme.

## Nutzung

Kopiere die Ordner `icons/`, `favicon/` und die Manifest-Dateien in deinen `public/`-Ordner. Den Inhalt aus `html-head-snippet.html` kannst du in den `<head>` deiner Webapp übernehmen.

In den Manifest-Dateien sind `name` und `short_name` bewusst generisch als `App` gesetzt. Ersetze sie durch deinen finalen Produktnamen.
