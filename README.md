# Truck Load Planner

A static browser app for planning non-stacking truck loads from cargo dimensions and weights. This export reflects the live planner through September 28, 2026, including multiple overwidth pieces on one truck when they fit sequentially within length, height, and weight limits.

## Put this project on GitHub

1. Extract `Truck_Load_Planner_GitHub.zip`.
2. Create a repository in your approved GitHub account or organization.
3. Upload the **contents** of the `Truck_Load_Planner_GitHub` folder to the repository root. Keep `index.html`, `app.js`, `style.css`, `.nojekyll`, and the `vendor` folder in their current relative positions. Do not upload the ZIP as a single file if you want GitHub to display or publish the website.
4. Commit the files. The app has no package installation or build step.

To publish with GitHub Pages where your organization allows it, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select your main branch and `/(root)`, then save. The app's entry point is the root `index.html`. GitHub's [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) describe the current settings. GitHub Pages publication is separate from the private ChatGPT Site and follows your organization's repository and access policies.

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

## Planning behavior

- Decks are 102 inches wide. A piece placed at 103–174 inches wide may overhang; nothing else can occupy the same front-to-rear span beside it. Multiple overwidth pieces may share a truck in sequence.
- The 53-foot Stepdeck and Lo-Pro Stepdeck have a separate 102-inch upper deck and a lower deck. Stretch Step and Stretch RGN are single-piece equipment.
- Floor rotation is considered only when selected for that cargo row. The planner checks length, height, weight, and floor collisions.
- Cargo wider than 174 inches, taller than 150 inches, or heavier than 55,000 pounds is excluded from automatic packing for heavy haul review.
- The Excel export provides a truck summary and a heavy haul review sheet.

This is a planning estimate. Verify actual trailer specifications, axle distribution, securement, permits, and route requirements before loading.
