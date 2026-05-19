import { z } from 'zod';

export const drsModeSchema = z.enum(['local', 'registry', 'auto']);

export const localPackageSchema = z.object({
  path: z.string().min(1),
  build: z.string().optional(),
});

export const registryPackageSchema = z.object({
  version: z.string().min(1),
});

export const packageEntrySchema = z.object({
  local: localPackageSchema,
  registry: registryPackageSchema,
});

export const consumerSchema = z.object({
  dir: z.string().min(1),
  dependencies: z.array(z.string().min(1)).min(1),
});

export const dockerWhenLocalSchema = z.object({
  context: z.string().min(1),
  dockerfile: z.string().min(1),
});

export const dockerServiceSchema = z.object({
  whenLocal: dockerWhenLocalSchema.optional(),
});

export const drsConfigSchema = z.object({
  version: z.literal(1),
  root: z.string().default('.'),
  defaults: z
    .object({
      mode: drsModeSchema.default('auto'),
    })
    .default({}),
  packages: z.record(z.string(), packageEntrySchema),
  consumers: z.record(z.string(), consumerSchema),
  docker: z.record(z.string(), dockerServiceSchema).optional(),
});

export type DrsMode = z.infer<typeof drsModeSchema>;
export type DrsSource = 'local' | 'registry';
export type DrsConfig = z.infer<typeof drsConfigSchema>;
export type PackageEntry = z.infer<typeof packageEntrySchema>;
export type ConsumerConfig = z.infer<typeof consumerSchema>;

export { drsConfigSchema as configSchema };
