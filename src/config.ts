import { readFileSync } from 'node:fs';
import { parseBudgetsFile } from './thresholds/budgets-file.js';
import { parseByteSize, parseSizeOrPercent } from './thresholds/size-value.js';
import type { ThresholdConfig } from './thresholds/types.js';
import type { ActionInputs } from './inputs.js';

/**
 * Builds a {@link ThresholdConfig} from parsed action inputs, mirroring
 * `src/cli.ts`'s `buildThresholdConfig` (same flag semantics, kebab-case
 * input names) but reading from `ActionInputs` instead of CLI flags.
 */
export function buildThresholdConfigFromInputs(inputs: ActionInputs): ThresholdConfig {
  const config: ThresholdConfig = {};
  if (inputs.warnRouteSize !== undefined)
    config.warnRouteSize = parseByteSize(inputs.warnRouteSize);
  if (inputs.failRouteSize !== undefined)
    config.failRouteSize = parseByteSize(inputs.failRouteSize);
  if (inputs.warnRouteIncrease !== undefined)
    config.warnRouteIncrease = parseSizeOrPercent(inputs.warnRouteIncrease);
  if (inputs.failRouteIncrease !== undefined)
    config.failRouteIncrease = parseSizeOrPercent(inputs.failRouteIncrease);
  if (inputs.warnTotalIncrease !== undefined)
    config.warnTotalIncrease = parseSizeOrPercent(inputs.warnTotalIncrease);
  if (inputs.failTotalIncrease !== undefined)
    config.failTotalIncrease = parseSizeOrPercent(inputs.failTotalIncrease);
  if (inputs.warnSharedSize !== undefined)
    config.warnSharedSize = parseByteSize(inputs.warnSharedSize);
  if (inputs.failSharedSize !== undefined)
    config.failSharedSize = parseByteSize(inputs.failSharedSize);
  if (inputs.budgetsFile !== undefined) {
    config.budgets = parseBudgetsFile(readFileSync(inputs.budgetsFile, 'utf8'), inputs.budgetsFile);
  }
  return config;
}
