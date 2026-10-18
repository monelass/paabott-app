import { supabase } from '../config/supabase';

// Fetch a user's wallet, or create one if it doesn't exist yet
export const getOrCreateWallet = async (userId, userType) => {
  try {
    let { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data && !error) {
      // Create a blank wallet
      const { data: newWallet, error: insertError } = await supabase
        .from('wallets')
        .insert([{ user_id: userId, user_type: userType }])
        .select()
        .single();
        
      if (insertError) throw insertError;
      return newWallet;
    }
    return data;
  } catch (error) {
    console.error('Wallet Error:', error);
    return null;
  }
};