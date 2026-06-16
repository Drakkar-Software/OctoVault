import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { kvGet, kvSet } from '@drakkar.software/octovault-sdk/platform';
import type { Capability } from '@drakkar.software/octovault-sdk';
import { ACTIVE_VARIANT, VARIANTS, type VariantConfig, type VariantId } from './variants';

interface BrandContextValue {
  variant: VariantConfig;
  has: (cap: Capability) => boolean;
  setVariant: (id: VariantId) => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);
const KV_KEY = 'variant:active';

export function BrandProvider({ children }: { children: ReactNode }) {
  const [variantId, setVariantIdState] = useState<VariantId>(ACTIVE_VARIANT);

  useEffect(() => {
    void kvGet(KV_KEY).then((stored) => {
      if (stored != null && stored in VARIANTS) setVariantIdState(stored as VariantId);
    });
  }, []);

  const setVariant = useCallback((id: VariantId) => {
    setVariantIdState(id);
    void kvSet(KV_KEY, id);
  }, []);

  const variant = VARIANTS[variantId];
  const value = useMemo<BrandContextValue>(
    () => ({
      variant,
      has: (cap: Capability) => variant.features.includes(cap),
      setVariant,
    }),
    [variant, setVariant],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used inside BrandProvider');
  return ctx;
}
