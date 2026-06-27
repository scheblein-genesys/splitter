# OrgSync Splitter

A React/Vite prototype for modeling Genesys Cloud OrgSync split jobs.

## What it does

- Starts with a locked `core` split that owns every syncable resource except the default no-sync list.
- Loads the live Genesys Cloud dependency catalog, with a bundled fallback catalog for local/offline use.
- Lets you add focused splits and move resource types out of core into those splits.
- Automatically keeps each selected resource type owned by only one split.
- Tracks global no-sync excludes.
- Derives first-level dependencies for each split from the dependency catalog.
- Previews the generated `source_export_template.tf` include filter for the selected split.
- Previews the generated `exclude_resources.csv` for the selected split.
- Exports and imports a workspace JSON file so the model can be reviewed, shared, and continued later.

## Run locally

```bash
npm install
npm run dev
```

## Build locally

```bash
npm run build
npm run preview
```

## Deploy with GitHub Pages

This repo includes `.github/workflows/pages.yml`.

1. Push this project to a GitHub repository.
2. In GitHub, go to **Settings > Pages**.
3. Set **Build and deployment > Source** to **GitHub Actions**.
4. Push to `main`, or run the workflow manually from the **Actions** tab.

The workflow builds the Vite app and publishes the `dist` directory through GitHub Pages.

## Vite base path

For a normal GitHub Pages project site, the app must load assets from `/<repo-name>/`. The included `vite.config.js` derives that from `GITHUB_REPOSITORY` during Actions builds.

For a custom domain or root deployment, set this repository variable or workflow env var:

```bash
VITE_BASE_PATH=/
```

For a different subpath, use something like:

```bash
VITE_BASE_PATH=/some/path/
```

## License

No open-source license is granted for this repository.

The source is publicly visible for reference and personal use only. Commercial redistribution, resale, and distribution of modified versions are not permitted without written permission.
