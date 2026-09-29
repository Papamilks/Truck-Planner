# Truck Load Planner

A static browser app for planning non-stacking truck loads from cargo dimensions and weights. The browser planner supports multiple overwidth pieces on one truck when they fit sequentially within length, height, and weight limits.

## Getting started

The application files belong at the repository root, with `index.html`, `app.js`, `style.css`, `.nojekyll`, `vendor/`, and `examples/` in their current relative positions. There is no package installation or build step.

To publish with GitHub Pages, open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save. The entry point is `index.html`. Publication and visibility follow the repository's GitHub settings.

## Run locally

From the extracted folder, run `py -m http.server 8000` in Windows PowerShell if Python is installed. Open `http://localhost:8000`. On macOS or Linux use `python3 -m http.server 8000`. A local HTTP server is needed for the bundled PDF.js module and worker.

## Contents

| Path | Purpose |
| --- | --- |
| `index.html` | Cargo entry, trailer editing, load plan, heavy haul review |
| `app.js` | Import, packing, visualization, and Excel export logic |
| `style.css` | Layout and styling |
| `vendor/` | Bundled JSZip and PDF.js, including their license notices |
| `examples/Truck_Load_Planner_Test_Packing_List_100_Items.xlsx` | Sample cargo input covering equipment, rotation, and heavy haul |
| `.nojekyll` | Tells GitHub Pages to serve these static files directly |

## Default equipment

All dimensions are inches. Each deck is 102 inches wide, and the initial planning weight limit is 45,000 lb per trailer. Limits can be edited in the Trailer types grid.

| Equipment | Main/lower deck length | Upper deck length | Main/lower height | Upper height |
| --- | ---: | ---: | ---: | ---: |
| 53' Flatbed | 636 | — | 102 | — |
| 53' Stepdeck | 522 | 102 | 122 | 102 |
| 53' Lo-Pro Stepdeck | 522 | 102 | 126 | 102 |
| Stretch Step | 840 | 102 | 122 | 102 |
| RGN | 360 | — | 138 | — |
| Stretch RGN | 720 | — | 138 | — |

## Use the planner

1. Add cargo manually, paste spreadsheet rows, or import CSV, Excel, or a text-based PDF packing list. Scanned PDFs need OCR before import.
2. Enter dimensions, weight, quantity, and units. Select **Rotate** only for pieces allowed to turn 90 degrees on the deck.
3. Edit trailer limits in **Trailer types** if needed, then create the plan.
4. Review the top-down layouts, piece tooltips, total weights, items that could not be placed, and heavy haul review.
5. Select **Export Excel summary** to download a workbook with the Load Plan Summary and Heavy Haul Review sheets.

The 100-item workbook in `examples/` exercises all six equipment types, opt-in rotation, and heavy haul exceptions.

## Planning behavior

- Decks are 102 inches wide. A piece placed at 103–174 inches wide may overhang; nothing else can occupy the same front-to-rear span beside it. Multiple overwidth pieces may share a truck in sequence.
- The 53-foot Stepdeck and Lo-Pro Stepdeck have a separate 102-inch upper deck and a lower deck. Stretch Step and Stretch RGN are single-piece equipment.
- Floor rotation is considered only when selected for that cargo row. The planner checks length, height, weight, and floor collisions.
- Cargo wider than 174 inches, taller than 150 inches, or heavier than 55,000 pounds is excluded from automatic packing for heavy haul review.
- The Excel export provides a truck summary and a heavy haul review sheet.

This is a planning estimate. Verify actual trailer specifications, axle distribution, securement, permits, and route requirements before loading.
