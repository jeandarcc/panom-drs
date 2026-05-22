export interface DrsLog {
  progress(message: string): void;
}

export interface DrsLogOptions {
  verbose?: boolean;
  quiet?: boolean;
}

export function createDrsLog(options: DrsLogOptions = {}): DrsLog {
  const enabled = !options.quiet;

  return {
    progress(message: string) {
      if (enabled) {
        console.error(`[drs] ${message}`);
      }
    },
  };
}

export type DrsProgressOptions = DrsLogOptions & {
  log?: DrsLog;
};

export function resolveLog(options: DrsProgressOptions = {}): DrsLog {
  return options.log ?? createDrsLog(options);
}
