# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-05-03

### Added
- **Face Sensing Extension Support**: Full integration with Scratch's Face Sensing extension, including verified opcodes, numeric argument mapping, and automated intent detection.
- **"Face Mask Game" Template**: New home page button for quickly generating face-tracking projects.
- **Expert Coding Rules**: Implemented the "Griffpatch Manifesto" in the AI system prompt to enforce "Single Script Architecture" and eliminate redundant logic branching.

### Fixed
- **Hardened Target Resolution**: Improved `getStageTarget` and `deleteSprite` in `vmHook.js` and `spriteController.js` to be more resilient against race conditions and missing sprites.
- **Block Injection Accuracy**: Fixed opcode and argument names for extension blocks based on live VM inspection (e.g., corrected `faceSensing_goToPart` and numeric part IDs).

## [2.0.0] - 2026-05-02

### Changed
- **Major Restructuring**: Reorganized project structure—all source files moved from root to `src/` directory.
- Updated manifest to version 2.0.0 with improved permissions and host_permissions declarations.
- Enhanced manifest description to clarify Gemini AI integration.

### Added
- New modular architecture with dedicated utilities: `logger.js`, `vmHook.js`, `assetManager.js`, `blockBuilder.js`, `spriteController.js`, `variableManager.js`, `extensionLoader.js`, `projectSerializer.js`, and `debugPanel.js`.
- Icon support (128x128) for improved extension branding.
- Explicit host permissions for Scratch resources and Gemini API endpoints.

### Security
- Updated security contact email in SECURITY.md.

## [1.0.0] - 2026-04-30

### Added
- Initial release of Scratch Copilot AI extension.
- Integrated Gemini AI client for natural language processing.
- Developed VM Controller for real-time Scratch project modification.
- Implemented modern UI with a 🤖 launcher, dark mode, and chat interface.
- Added project structure: `README.md`, `LICENSE`, `.gitignore`, and governance templates.

## [1.0.1] - 2026-05-01

### Fixed
- Resolved "Cannot read properties of undefined (reading 'indexOf')" runtime error in Scratch VM during sound loading.
- Fixed block injection bug where dropdown menus (sounds, costumes, backdrops) were being generated as plain text blocks instead of menu shadows.
- Improved Scratch VM stability by sequentializing asset creation and block injection to prevent race conditions.
- Enhanced sprite/sound/costume identification with additional properties (`assetId`, `md5`) for better VM compatibility.
- Added automatic workspace switching so the user can see injected blocks immediately in the editor.
- Fixed library searching to be more robust against missing or malformed catalog entries.
