import { describe, it, expect } from 'vitest';

// Test that skeleton components export correctly (pure export checks)
describe('skeleton exports', () => {
  it('exports SkeletonBox, SkeletonCircle, SkeletonText', async () => {
    const { SkeletonBox, SkeletonCircle, SkeletonText } =
      await import('@/components/common/Skeleton');
    expect(typeof SkeletonBox).toBe('function');
    expect(typeof SkeletonCircle).toBe('function');
    expect(typeof SkeletonText).toBe('function');
  });

  it('exports HomeSkeleton', async () => {
    const mod = await import('@/components/common/skeletons/HomeSkeleton');
    expect(typeof mod.default).toBe('function');
  });

  it('exports GroupListSkeleton', async () => {
    const mod = await import('@/components/common/skeletons/GroupListSkeleton');
    expect(typeof mod.default).toBe('function');
  });

  it('exports PlaceDetailSkeleton', async () => {
    const mod = await import('@/components/common/skeletons/PlaceDetailSkeleton');
    expect(typeof mod.default).toBe('function');
  });

  it('exports ProfileSkeleton', async () => {
    const mod = await import('@/components/common/skeletons/ProfileSkeleton');
    expect(typeof mod.default).toBe('function');
  });
});
