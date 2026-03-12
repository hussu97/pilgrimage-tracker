import { SkeletonBox, SkeletonCircle, SkeletonText } from '@/components/common/Skeleton';
import HomeSkeleton from '@/components/common/skeletons/HomeSkeleton';
import GroupListSkeleton from '@/components/common/skeletons/GroupListSkeleton';
import PlaceDetailSkeleton from '@/components/common/skeletons/PlaceDetailSkeleton';
import ProfileSkeleton from '@/components/common/skeletons/ProfileSkeleton';

describe('skeleton exports', () => {
  it('exports SkeletonBox, SkeletonCircle, SkeletonText', () => {
    expect(typeof SkeletonBox).toBe('function');
    expect(typeof SkeletonCircle).toBe('function');
    expect(typeof SkeletonText).toBe('function');
  });

  it('exports HomeSkeleton', () => {
    expect(typeof HomeSkeleton).toBe('function');
  });

  it('exports GroupListSkeleton', () => {
    expect(typeof GroupListSkeleton).toBe('function');
  });

  it('exports PlaceDetailSkeleton', () => {
    expect(typeof PlaceDetailSkeleton).toBe('function');
  });

  it('exports ProfileSkeleton', () => {
    expect(typeof ProfileSkeleton).toBe('function');
  });
});
