import { useAppStore } from '../store/useAppStore';
import { getTierInfo, getNextTier, KARMA_REWARDS } from '../services/karma';

export function useKarma() {
  const { user, addKarma } = useAppStore();
  const tierInfo = getTierInfo(user.tier);
  const nextTier = getNextTier(user.karma);

  const progressToNextTier = nextTier
    ? (user.karma - tierInfo.min) / (nextTier.min - tierInfo.min)
    : 1;

  return {
    karma: user.karma,
    tier: user.tier,
    tierInfo,
    nextTier,
    progressToNextTier: Math.min(progressToNextTier, 1),
    shareSpot: () => addKarma(KARMA_REWARDS.SHARE_SPOT),
    useSpot: () => addKarma(KARMA_REWARDS.SPOT_CLAIMED),
  };
}
