# Bundled PDF fonts

`NotoSans_400Regular.ttf` and `NotoSans_700Bold.ttf` are vendored from the
`@expo-google-fonts/noto-sans` npm package (v0.4.2), which packages Google's
Noto Sans under the SIL Open Font License 1.1 (`OFL.txt`).

They are checked in rather than installed because that package ships ~36
weights (13MB unpacked) and contract PDFs need exactly two. `PdfService`
embeds them with a subset, so only the glyphs actually used land in each PDF.

Noto Sans covers Latin (including Vietnamese and Central European), Greek and
Cyrillic. It has no CJK glyphs; `PdfService` logs a warning when a contract
contains characters it cannot render. Supporting CJK means adding Noto Sans
CJK (~16MB) here.
