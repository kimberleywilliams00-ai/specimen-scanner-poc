# Labbie (v3.8.23)

## Illustration credits
The container illustrations in `img/containers/` (tubes, urine container, swabs, stool and FIT containers) are **original artwork by
Kimberley Williams** and are used with her permission. They are shown on the collection plan cards only where the container named in
the source data clearly matches the drawing. Small label text in some drawings (e.g. "Mulittest", "Transpot" on the Multitest swab, and
the stool container / eSwab labels) is part of the artwork and is used as-is.

When v3.8 is published, add this credit to the deploy repo README as well.

v3.8.23 (2026-10-27, K. Williams approved): HPV / Cervix Self-Screening — FLOQ illustration, room-temp storage reword, kit PDF + BC Cancer HP links on card, no Details/Sources, patient sheet cleanup; BCCDC STI Quick Reference PDF in plan References; QRG “Not on the LifeLabs Quick Reference Chart” note for blood tubes only; swab illustrations larger (88×140); bacterial C&S (nose, wound, throat) use existing blue-top COPAN Amies drawing.

v3.8.22 (2026-10-25, K. Williams approved): Collection plan groups same-type off-chart tubes (colour+size, including `own`) under one card with ×N and numbered lines — still separate physical tubes (`summary.js` unchanged). Quiet “Not on the LifeLabs Quick Reference Chart” note (linked) under those tests only — not amber Confirm-with-lab.

v3.8.21 (2026-10-25, K. Williams approved): HIV Serology AKA for EMR `HIV 1+2 Ab/Ag EIA (4th Gen)` (and close `+`/`&` variants) so Confirm tests scores ok instead of yellow check on a correct match.

v3.8.20 (2026-10-25, K. Williams approved): Confirm tests dual-name — when form wording (alias/OCR) differs from dictionary common name, show primary testName plus quieter secondary 'Scanned alias: …'; same-name rows stay single-line.

v3.8.19 (2026-10-25, K. Williams approved): Pregnancy Serum / serum pregnancy EMR wording → blood Beta-hCG (bhcg, SST); NEED_TOKEN pregnancy.not='serum' so urine Pregnancy Test never wins when the line has serum; matcher applies not to every synonym. Urine paths unchanged (Pregnancy Test, urine HCG, beta HCG urine).

v3.8.18 (2026-10-25, K. Williams approved): restore cover-filled camera frame (revert v3.8.17 contain pillarbox); WYSIWYG yellow corners at 4px inset + liveGrab content-box cover crop; remove photo-screen Options & version details (footer #ver kept); keepImage false; engine update null-safe. Soft ideals 1920×1440 / 4:3 and liveWiden() kept under cover.

v3.8.17 (2026-10-25, K. Williams approved): wider in-app camera FOV — video object-fit:contain (was cover), getUserMedia ideals 1920×1440 / 4:3 (was 3840×2160), liveWiden() zoom-min when supported, liveGrab() captures the full visible frame (matches contain mapping). Gold 1.3:1 viewfinder unchanged. Reverted in v3.8.18 after iPhone pillarboxing.

v3.8.16 (2026-10-24, K. Williams approved): Hep A immune shares the BCCDC SST with HCV/HIV/syphilis (Hep A IgM stays LifeLabs spun). Acute/chronic hepatitis dual-tube clarity: panel titles on both halves; grey line e.g. "Chronic hepatitis panel, tube 1 of 2 includes: anti-HBc · HBsAg · anti-HBs" / "Chronic hepatitis panel, tube 2 of 2 includes: anti-HCV"; HIV/syphilis/Hep A immune stay in the BCCDC title only.

v3.8.15 (2026-10-22, K. Williams approved): total, direct and indirect bilirubin share one 5 mL SST (direct/indirect placed in the chart's "Bilirubin" tube by local rule
`bilirubin_fractions_one_sst`; indirect bilirubin shown as calculated by the lab, LifeLabs page Methodology "Calculation", no extra tube). Card prep lines given only by the
BCCDC eLab handbook now say "- as per BCCDC eLab handbook" (linked), e.g. "At least 1 hour after a meal - as per BCCDC eLab handbook" on the syphilis / HIV / Hep C serology tube.

Illustration use (t228d, 2026-10-21; published in v3.8.14): `copan_blue_cap_swab_medium.webp` (Kimberley's blue-top COPAN Amies swab drawing; she confirmed
it is the COPAN Amies swab) was previously unassigned. It is now shown on ONE card only, the D2350 'Vaginitis - initial (BV & yeast)' card
(local rule `bv_yeast_copan_red`, alt text "COPAN blue-top Amies swab"). No other card (GC culture, throat, wound, nose, sputum, vaginal C&S)
uses it.
