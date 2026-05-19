import path from 'node:path';

/** Build npm file: specifier from consumer dir to local package dir (posix slashes). */
export function toFileSpecifier(consumerDir: string, localPackageDir: string): string {
  const rel = path.relative(consumerDir, localPackageDir);
  const posix = rel.split(path.sep).join('/');
  if (!posix || posix === '.') {
    return 'file:.';
  }
  return `file:${posix.startsWith('.') ? posix : `./${posix}`}`;
}

export function normalizeForCompare(specifier: string): string {
  if (!specifier.startsWith('file:')) {
    return specifier;
  }
  let p = specifier.slice('file:'.length);
  if (p.startsWith('./')) {
    p = p.slice(2);
  }
  return `file:${p.split(path.sep).join('/')}`;
}
