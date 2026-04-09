# Report Card HTML Reference Designs

These HTML files are the reference visual designs for the report card PDF templates. They were originally drafted under `report-card-spec/` and copied here during implementation 11 so they persist after that working folder is cleaned up.

| File                                       | Template                                             | Notes                                                                 |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `template-01.html` / `template-01-ar.html` | Editorial Academic — Fraunces + forest green + gold  | Ported to `apps/worker/src/report-card-templates/editorial-academic/` |
| `template-02.html` / `template-02-ar.html` | Modern Editorial — Bricolage Grotesque + cobalt blue | Ported to `apps/worker/src/report-card-templates/modern-editorial/`   |
| `template-03.html` / `template-03-ar.html` | Online-only viewing template                         | **Not** generated as a PDF — kept here for reference only             |

These files are the visual source of truth when iterating on the production PDF templates. Implementation 11 ports them as Handlebars templates under `apps/worker/src/report-card-templates/` and renders them through the worker's Puppeteer pipeline — the ported templates can reuse the HTML's CSS (grid, logical properties, SVG, variable fonts) essentially as-is. The grades-only render payload constrains what dynamic data is available, so the reference sections that depend on assignment / behavioural / attendance / class-average data are intentionally absent from the ported versions.
