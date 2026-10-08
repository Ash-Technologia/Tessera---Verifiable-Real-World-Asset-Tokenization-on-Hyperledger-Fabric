# Repository Guidelines

## Project Structure & Module Organization

Keep production code in the repository's primary source directories, tests alongside their related modules or in the existing test directories, and static assets in their established asset locations. Before adding a new top-level folder, check whether an existing module or package is a better fit. Keep generated output, local caches, and dependency folders out of version control.

## Build, Test, and Development Commands

Use the commands declared by the repository's tooling (for example, scripts in `package.json`, targets in a `Makefile`, or project documentation). Run the relevant checks before opening a pull request:

```sh
# Inspect available project commands
npm run        # Node projects
make help      # Make-based projects, when available
```

Do not introduce a new build tool or lockfile without a clear project need.

## Coding Style & Naming Conventions

Follow the style already used in the file you are editing. Use descriptive, scoped names: `userProfile` for variables and functions where the language convention is camelCase, and `UserProfile` for types/classes where PascalCase is established. Prefer small, focused modules and avoid unrelated formatting churn. Run the repository's configured formatter and linter when present.

## Testing Guidelines

Add or update tests for behavior changes and bug fixes. Name tests after the behavior being verified, such as `returns_error_when_token_is_missing`. Keep tests deterministic: avoid real network access, wall-clock assumptions, and shared mutable state. Run the narrowest relevant test suite locally, then the full suite when practical.

## Commit & Pull Request Guidelines

Use the concise, imperative commit style visible in the project's Git history (for example, `Fix validation for empty input`). Keep commits focused and avoid mixing refactors with functional changes. Pull requests should explain the change, note tests run, link the related issue when applicable, and include screenshots for visible UI changes. Flag configuration, migration, or security-impacting changes explicitly.

## Security & Configuration

Never commit secrets, credentials, or local environment files. Document required configuration keys in the appropriate example configuration file, using placeholder values only.
