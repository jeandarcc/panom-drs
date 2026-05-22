/** Commands that validate package layout without producing a dist artifact. */
export function isValidationOnlyBuild(buildCommand: string | undefined): boolean {
  if (!buildCommand) {
    return false;
  }
  return buildCommand.includes('pack:check');
}

export function requiresDistArtifact(buildCommand: string | undefined): boolean {
  return Boolean(buildCommand) && !isValidationOnlyBuild(buildCommand);
}
