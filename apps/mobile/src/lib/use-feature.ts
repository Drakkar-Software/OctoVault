import type { Capability } from '@drakkar.software/octovault-sdk';
import { useBrand } from './brand-context';

export function useFeature(cap: Capability): boolean {
  return useBrand().has(cap);
}
