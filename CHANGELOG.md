# Changelog

## 1.1.0

- **`drs build`**: single command — resolve, apply, local package builds, consumer `npm install`, and drift check.
- **`auto` mode in CI**: when `CI=true` or `GITHUB_ACTIONS=true`, `auto` uses registry versions even if local package folders exist in the checkout. On developer machines, `auto` still prefers `file:` when paths exist.
- Export `isCiEnvironment()`, `build()`, `formatBuildSummary()`.

## 1.0.0

- Initial release: `resolve`, `apply`, `check`, `init`, `docker` CLI and programmatic API.
