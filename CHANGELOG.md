# CHANGELOG.md

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-20
### Added
- Zero-dependency Node.js CLI tool transforming network traces into interactive sequence diagrams.
- Resilient streaming chunked parser for Chromium NetLog files (`chrome://net-export/`).
- Ingestion support for HAR archives and generic execution span traces.
- Canonical Intermediate Representation (IR) normalizer with automatic credential redaction.
- Signal-flow SVG layout engine featuring dark obsidian theme, glowing activation lifelines, and semantic arrows.
- Standalone, 100% self-contained HTML generation with zero external CDN or font dependencies.
- Interactive client-side canvas engine with pan/zoom, route hover highlighting, floating tooltips, and inspector drawer.
- CLI command `traceviz` / `socketmap` supporting `--sample`, `--filter`, `-o/--output`, and `--open`.
