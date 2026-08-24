CUSTOM FONTS
============

The site uses 5 fonts. Two load automatically from Google Fonts:

  • Syne       (headings / card titles)   — loads from Google Fonts
  • Comfortaa  (body / UI text)           — loads from Google Fonts

Three are PREMIUM fonts and are NOT on Google Fonts, so their files are
not included here (licensing). Drop your licensed files into THIS folder
and they activate automatically. Use these exact file names:

  • TAN - MERMAID        ->  TAN-MERMAID.woff2   (or .woff / .ttf)
  • Northwell            ->  Northwell.woff2     (or .woff / .ttf)
  • Brittany Signature   ->  BrittanySignature.woff2 (or .woff / .ttf)

Where they are used:
  • TAN - MERMAID      : large decorative page/hero titles
  • Northwell          : script accents (e.g. "Xush kelibsiz", roles)
  • Brittany Signature : signature accent (wordmark subtitle)

Until you add the files, the site falls back gracefully:
  TAN Mermaid -> Syne,  Northwell/Brittany -> the system cursive face.

Tip: convert .ttf/.otf to .woff2 at https://cloudconvert.com or with
the `fonttools` / `woff2` CLI for smaller, faster files.
