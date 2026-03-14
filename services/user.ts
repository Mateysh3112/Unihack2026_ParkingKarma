import { supabase } from './supabase';
import { User, LeaderboardEntry } from '../types';
import { getKarmaTier } from './karma';

function rowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name ?? 'Anonymous User',
    email: row.email ?? null,
    photoURL: null,
    karma: row.karma ?? 0,
    tier: row.tier ?? 'Seedling',
    karmaStrikes: row.karma_strikes ?? 0,
    isFrozen: row.is_frozen ?? false,
    freezeExpiresAt: row.freeze_expires_at ? new Date(row.freeze_expires_at).getTime() : null,
    parkingSinnerUntil: row.parking_sinner_until ? new Date(row.parking_sinner_until).getTime() : null,
    spotsShared: row.spots_shared ?? 0,
    spotsUsed: row.spots_claimed ?? 0,
  };
}

export const createUserProfile = async (
  supabaseUser: any,
  displayName?: string,
): Promise<User> => {
  const name =
    displayName ||
    supabaseUser.user_metadata?.display_name ||
    supabaseUser.email?.split('@')[0] ||
    'Anonymous User';
  const email = supabaseUser.email ?? null;

  // Insert if not exists (ignoreDuplicates avoids overwriting karma/stats)
  await supabase.from('users').upsert(
    { id: supabaseUser.id, name, email, karma: 0, tier: 'Seedling', karma_strikes: 0, is_frozen: false, spots_shared: 0, spots_claimed: 0 },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  // If a display name was explicitly provided (e.g. sign-up), update it
  if (displayName) {
    await supabase.from('users').update({ name: displayName }).eq('id', supabaseUser.id);
  }

  return (await getUserProfile(supabaseUser.id)) ?? {
    id: supabaseUser.id,
    name,
    email,
    photoURL: null,
    karma: 0,
    tier: 'Seedling',
    karmaStrikes: 0,
    isFrozen: false,
    freezeExpiresAt: null,
    parkingSinnerUntil: null,
    spotsShared: 0,
    spotsUsed: 0,
  };
};

export const getUserProfile = async (userId: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return rowToUser(data);
};

export const updateUserProfile = async (
  userId: string,
  updates: Partial<User>,
): Promise<void> => {
  const db: Record<string, any> = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.email !== undefined) db.email = updates.email;
  if (updates.karma !== undefined) db.karma = updates.karma;
  if (updates.tier !== undefined) db.tier = updates.tier;
  if (updates.karmaStrikes !== undefined) db.karma_strikes = updates.karmaStrikes;
  if (updates.isFrozen !== undefined) db.is_frozen = updates.isFrozen;
  if (updates.freezeExpiresAt !== undefined) {
    db.freeze_expires_at = updates.freezeExpiresAt
      ? new Date(updates.freezeExpiresAt).toISOString()
      : null;
  }
  if (updates.parkingSinnerUntil !== undefined) {
    db.parking_sinner_until = updates.parkingSinnerUntil
      ? new Date(updates.parkingSinnerUntil).toISOString()
      : null;
  }
  if (updates.spotsShared !== undefined) db.spots_shared = updates.spotsShared;
  if (updates.spotsUsed !== undefined) db.spots_claimed = updates.spotsUsed;

  const { error } = await supabase.from('users').update(db).eq('id', userId);
  if (error) console.error('Update user profile error:', error);
};

export const addKarmaToUser = async (userId: string, amount: number): Promise<void> => {
  const user = await getUserProfile(userId);
  if (!user) return;
  const newKarma = user.karma + amount;
  const newTier = getKarmaTier(newKarma);
  await updateUserProfile(userId, { karma: newKarma, tier: newTier });
};

export const incrementUserStats = async (
  userId: string,
  stat: 'spotsShared' | 'spotsUsed',
): Promise<void> => {
  const user = await getUserProfile(userId);
  if (!user) return;
  await updateUserProfile(userId, { [stat]: (user[stat] ?? 0) + 1 });
};

export const getLeaderboard = async (limitCount = 50): Promise<LeaderboardEntry[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, karma, tier')
    .gt('karma', 0)
    .order('karma', { ascending: false })
    .limit(limitCount);
  if (error || !data) return [];
  return data.map((row, index) => ({
    userId: row.id,
    name: row.name ?? 'Anonymous',
    karma: row.karma,
    tier: row.tier,
    rank: index + 1,
  }));
};
