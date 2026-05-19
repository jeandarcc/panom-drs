/** True when running in a CI environment (GitHub Actions, GitLab CI, etc.). */
export function isCiEnvironment(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}
