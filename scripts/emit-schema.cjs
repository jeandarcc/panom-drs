#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { zodToJsonSchema } = require('zod-to-json-schema');

// Load compiled schema from dist after build, or inline require ts - use dynamic import of built file
// For emit-schema we duplicate minimal approach: read from dist if exists, else use zod from src via ts-node
// Simpler: inline the zod schema by requiring after tsup - run emit after first build only.

async function main() {
  const distSchema = path.join(__dirname, '../dist/config/schema.js');
  if (!fs.existsSync(distSchema)) {
    console.error('Run npm run build first, then npm run build:schema');
    process.exit(1);
  }
  const { drsConfigSchema } = await import(pathToFileURL(distSchema).href);
  const jsonSchema = zodToJsonSchema(drsConfigSchema, {
    name: 'DrsConfig',
    $refStrategy: 'none',
  });
  const outDir = path.join(__dirname, '../schema');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'drs.config.schema.json');
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...jsonSchema }, null, 2)}\n`,
    'utf8'
  );
  console.log(`Wrote ${outPath}`);
}

function pathToFileURL(p) {
  const { pathToFileURL } = require('node:url');
  return pathToFileURL(p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
