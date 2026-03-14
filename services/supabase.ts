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

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!existing) {
    await supabase.from('users').insert({
      id: user.id,
      name: 'Anonymous User',
      karma: 0,
      tier: 'Seedling',
      karma_strikes: 0,
      is_frozen: false,
      spots_shared: 0,
      spots_claimed: 0,
    });
    console.log('New user created in Supabase');
  }

  console.log('Supabase connected! User ID:', user.id);
  return user;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
};

export const signOutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = () => {
  return supabase.auth.getUser();
};
