import { useMemo } from 'react';
import type { CreatableTypeEntry } from '@drakkar.software/octovault-sdk';
import { useBrand } from './brand-context';
import { useTypeRegistry } from './type-registry-context';

/** Work-tree-creatable types filtered by the active variant's capabilities.
 *  Use on every create surface so capability gating is enforced uniformly. */
export function useCreatableTypes(): CreatableTypeEntry[] {
  const registry = useTypeRegistry();
  const { has } = useBrand();
  return useMemo(
    () =>
      registry
        .creatableTypes()
        .filter((d) => d.workTree && d.editor !== 'file' && (!d.capability || has(d.capability))),
    [registry, has],
  );
}
