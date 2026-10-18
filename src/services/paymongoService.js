import { supabase } from '../config/supabase';

// ✨ Added cancelUrl to parameters
export const createPaymentLink = async (amount, description, returnUrl, email, name, cancelUrl) => {
  try {
    // ✨ STRICT FIX: Ensure we only send the exact base decimal (e.g., 314.35)
    // We DO NOT multiply by 100 here because your Supabase Edge Function already handles it.
    const cleanAmount = Number(parseFloat(amount).toFixed(2));

    console.log("🚀 SENDING TO SUPABASE EDGE FUNCTION:", cleanAmount); 

    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('https://synquoutpytwgxgjmsnc.supabase.co/functions/v1/create-paymongo-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      // ✨ Send the clean decimal amount
      body: JSON.stringify({ amount: cleanAmount, description, returnUrl, email, name, cancelUrl }), 
    });

    const data = await response.json();

    // ✨ Catch the PayMongo rejection gracefully so the app doesn't crash
    if (!response.ok || !data.data || !data.data.attributes) {
      console.error('PayMongo API Rejection:', data);
      throw new Error(
        data.error || 
        data.errors?.[0]?.detail || 
        'Payment rejected. Make sure the amount is at least ₱20.00.'
      );
    }

    return data.data.attributes.checkout_url;
  } catch (error) {
    console.error('Paymongo Link Error:', error);
    throw error;
  }
};