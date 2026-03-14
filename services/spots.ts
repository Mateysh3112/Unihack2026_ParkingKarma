import { supabase } from './supabase';
import { FirestoreSpot, FloorSelectionResult, SpotStatus } from '../types';

export interface SpotData {
  sharer_id: string;
  lat: number;
  lng: number;
  status: string;
  floor: number;
  is_multi_storey: boolean;
  car_park_name: string | null;
  car_park_id: string | null;
  spot_type: string;
  timeout_at: string;
}

function rowToFirestoreSpot(row: any): FirestoreSpot {
  return {
    sharerId: row.sharer_id,
    location: { lat: row.lat, lng: row.lng },
    status: row.status as SpotStatus,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    broadcastAt: row.broadcast_at ? new Date(row.broadcast_at).getTime() : null,
    claimedBy: row.claimed_by ?? null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : null,
    karmaAwarded: row.karma_awarded ?? false,
    floor: row.floor,
    isMultiStorey: row.is_multi_storey,
    carParkId: row.car_park_id,
    carParkName: row.car_park_name,
  };
}

/** Create a new spot. Returns the spot ID. */
export async function createSpot(data: SpotData): Promise<string> {
  const { data: spot, error } = await supabase
    .from('spots')
    .insert({ ...data, karma_awarded: false })
    .select('id')
    .single();
  if (error) {
    console.error('Create spot error:', error);
    return `local_${Date.now()}`;
  }
  return spot.id;
}

/** Backward-compatible alias used by useVerificationStore. */
export async function createFirestoreSpot(
  sharerId: string,
  lat: number,
  lng: number,
  floorData?: FloorSelectionResult,
): Promise<string> {
  return createSpot({
    sharer_id: sharerId,
    lat,
    lng,
    status: 'pending_movement',
    floor: floorData?.floor ?? 0,
    is_multi_storey: floorData?.isMultiStorey ?? false,
    car_park_name: floorData?.carParkName ?? null,
    car_park_id: floorData?.carParkId ?? null,
    spot_type: 'normal',
    // Give 15 min so the full 10-min claim window survives monitoring time
    timeout_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}

/** Transition a spot to a new status. */
export async function updateSpotStatus(
  spotId: string,
  status: SpotStatus,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'broadcasting') {
    update.broadcast_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('spots')
    .update(update)
    .eq('id', spotId);
  if (error) console.error('Update spot status error:', error);
}

/** Mark a spot as claimed by a specific user. */
export async function claimSpot(spotId: string, claimerId: string): Promise<void> {
  const { error } = await supabase
    .from('spots')
    .update({
      status: 'claimed',
      claimed_by: claimerId,
      claimed_at: new Date().toISOString(),
      karma_awarded: true,
    })
    .eq('id', spotId);
  if (error) throw error;
}

/** Backward-compatible alias used by SpotClaimScreen. */
export const claimFirestoreSpot = claimSpot;

/** Mark a spot as stolen and record the thief. */
export async function markSpotStolen(spotId: string, thiefId: string): Promise<void> {
  const { error } = await supabase
    .from('spots')
    .update({ status: 'stolen', claimed_by: thiefId })
    .eq('id', spotId);
  if (error) console.error('Mark spot stolen error:', error);
}

/** Subscribe to real-time updates for a single spot. Returns unsubscribe fn. */
export function subscribeToSpot(
  spotId: string,
  callback: (spot: FirestoreSpot | null) => void,
): () => void {
  // Initial fetch
  supabase
    .from('spots')
    .select('*')
    .eq('id', spotId)
    .single()
    .then(({ data }) => {
      callback(data ? rowToFirestoreSpot(data) : null);
    });

  const subscription = supabase
    .channel(`spot-${spotId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'spots', filter: `id=eq.${spotId}` },
      (payload) => {
        callback(rowToFirestoreSpot(payload.new));
      },
    )
    .subscribe();

  return () => { subscription.unsubscribe(); };
}

/** Subscribe to real-time broadcasting spots. Returns unsubscribe fn. */
export function subscribeToBroadcastingSpots(
  callback: (spots: (FirestoreSpot & { id: string })[]) => void,
): () => void {
  const fetchAndNotify = async () => {
    const { data } = await supabase
      .from('spots')
      .select('*')
      .eq('status', 'broadcasting')
      .gt('timeout_at', new Date().toISOString());
    if (data) {
      callback(data.map((row) => ({ id: row.id, ...rowToFirestoreSpot(row) })));
    }
  };

  fetchAndNotify();

  const subscription = supabase
    .channel('broadcasting-spots')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'spots', filter: 'status=eq.broadcasting' },
      () => { fetchAndNotify(); },
    )
    .subscribe();

  return () => { subscription.unsubscribe(); };
}

/** Expire broadcasting spots whose timeout has passed. */
export async function expireOldSpots(): Promise<void> {
  const { error } = await supabase
    .from('spots')
    .update({ status: 'expired' })
    .eq('status', 'broadcasting')
    .lt('timeout_at', new Date().toISOString());
  if (error) console.error('Expire spots error:', error);
}

/** Record a suspicious tag for fraud detection. */
export async function recordSuspiciousTag(
  userId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await supabase
    .from('suspicious_activity')
    .upsert(
      { user_id: userId, last_tagged_lat: lat, last_tagged_lng: lng, last_tagged_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}
