import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const signInUser = async () => {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Supabase auth error:', error);
    return null;
  }

  const user = data.user;
  if (!user) return null;

  await upsertUserRow(user.id);
  console.log('Supabase connected! User ID:', user.id);

  return user;
};

async function upsertUserRow(userId: string) {
  const { error } = await supabase
    .from('users')
    .upsert({
      id: userId,
      karma: 0,
      tier: 'seedling',
      karma_strikes: 0,
      is_frozen: false,
      spots_shared: 0,
      spots_claimed: 0,
    }, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });
  if (error) console.error('User upsert error:', error);
}

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) await upsertUserRow(data.user.id);
  return data.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await upsertUserRow(data.user.id);
  return data.user;
};

export const signOutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = () => {
  return supabase.auth.getUser();
};
