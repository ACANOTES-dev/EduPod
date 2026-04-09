# Report Card HTML Reference Designs

These HTML files are the reference visual designs for the report card PDF templates. They were originally drafted under `report-card-spec/` and copied here during implementation 11 so they persist after that working folder is cleaned up.

| File                                       | Template                                             | Notes                                                              |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `template-01.html` / `template-01-ar.html` | Editorial Academic — Fraunces + forest green + gold  | Ported to `apps/web/src/report-card-templates/editorial-academic/` |
| `template-02.html` / `template-02-ar.html` | Modern Editorial — Bricolage Grotesque + cobalt blue | Ported to `apps/web/src/report-card-templates/modern-editorial/`   |
| `template-03.html` / `template-03-ar.html` | Online-only viewing template                         | **Not** generated as a PDF — kept here for reference only          |

These files are the visual source of truth when iterating on the React-PDF templates. The ported React-PDF components approximate the HTML as closely as `@react-pdf/renderer` allows (no CSS grid, limited flexbox, no CSS custom properties, etc.), and the grades-only render payload constrains what data is available.
