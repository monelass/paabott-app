import { supabase } from '../config/supabase';

// ✨ Helper to fetch the dynamic commission rate from Supabase settings
const getPlatformCommissionRate = async () => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'platform_commission_rate')
      .maybeSingle();

    if (data && data.value) {
      const parsedRate = Number(data.value);
      return isNaN(parsedRate) ? 0.10 : parsedRate;
    }
  } catch (err) {
    console.error('Failed to fetch commission rate, defaulting to 10%:', err);
  }
  return 0.10; // Default fallback
};

export const distributeOrderFunds = async (delivery) => {
  try {
    // 1. Fetch original order data because delivery_requests might be missing fields
    let orderData = delivery;
    if (delivery.order_id) {
      const { data: originalOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', delivery.order_id)
        .single();
        
      if (originalOrder) {
        orderData = originalOrder;
      }
    }

    // ✨ Fetch dynamic commission rate
    const commissionRate = await getPlatformCommissionRate();
    const riderRate = 1 - commissionRate;

    // 2. Calculate the Math
    const deliveryFee = Number(orderData.delivery_fee || delivery.fee || 50);
    const subtotal = Number(orderData.subtotal || 0); 
    
    // ✨ Dynamic commission calculations
    const platformCommission = deliveryFee * commissionRate; 
    const riderEarnings = deliveryFee * riderRate;      
    const storeEarnings = subtotal;                

    const riderId = delivery.driver_id || orderData.driver_id;
    
    // 3. Smart Store ID Lookup (Falls back to querying the stores table if vendor_id is null)
    let storeId = orderData.vendor_id || orderData.store_id || orderData.owner_id;
    
    if (!storeId && orderData.store_id) {
      const { data: storeRecord } = await supabase
        .from('stores')
        .select('*')
        .eq('id', orderData.store_id)
        .maybeSingle();
        
      if (storeRecord) {
        storeId = storeRecord.owner_id || storeRecord.user_id || storeRecord.vendor_id || storeRecord.id;
      }
    }

    if (!riderId || !storeId) {
      console.error('Missing IDs. Rider:', riderId, 'Store:', storeId);
      return;
    }

    // 4. Safely find or create the Rider Wallet
    let { data: riderWallet } = await supabase.from('wallets').select('*').eq('user_id', riderId).maybeSingle();
    if (!riderWallet) {
      const { data: newRider } = await supabase.from('wallets').insert({ 
        user_id: riderId, role: 'rider', available_balance: 0, cash_on_hand: 0 
      }).select().single();
      riderWallet = newRider;
    }

    // 5. Safely find or create the Store Wallet
    let { data: storeWallet } = await supabase.from('wallets').select('*').eq('user_id', storeId).maybeSingle();
    if (!storeWallet) {
      const { data: newStore } = await supabase.from('wallets').insert({ 
        user_id: storeId, role: 'store', available_balance: 0, cash_on_hand: 0 
      }).select().single();
      storeWallet = newStore;
    }

    if (!riderWallet || !storeWallet) return;

    // 6. Update Balances and Insert Ledger Logs
    if (orderData.payment_method === 'cod') {
      const riderOwesApp = storeEarnings + platformCommission;

      // Fetch absolute latest wallet data to prevent stale closures and accurately accumulate cash_on_hand
      const { data: freshRiderWallet } = await supabase
        .from('wallets')
        .select('cash_on_hand')
        .eq('id', riderWallet.id)
        .single();

      const currentCashOnHand = Number(freshRiderWallet?.cash_on_hand || 0);
      const updatedCashOnHand = currentCashOnHand + Number(riderOwesApp);

      // Fetch latest store balance
      const { data: freshStoreWallet } = await supabase
        .from('wallets')
        .select('available_balance')
        .eq('id', storeWallet.id)
        .single();

      const currentStoreBalance = Number(freshStoreWallet?.available_balance || 0);

      // Update Wallets with fresh combined values
      await supabase.from('wallets').update({ cash_on_hand: updatedCashOnHand }).eq('id', riderWallet.id);
      await supabase.from('wallets').update({ available_balance: currentStoreBalance + Number(storeEarnings) }).eq('id', storeWallet.id);

      // Insert Ledger Breakdown with Dynamic Labels
      const { error: ledgerError } = await supabase.from('ledger_transactions').insert([
        { wallet_id: riderWallet.id, order_id: orderData.id, amount: riderEarnings, transaction_type: 'earning', payment_reference: `COD Earning (${Math.round(riderRate * 100)}% Delivery Fee)` },
        { wallet_id: riderWallet.id, order_id: orderData.id, amount: storeEarnings, transaction_type: 'remittance_due', payment_reference: 'COD Collection (Store Payout)' },
        { wallet_id: riderWallet.id, order_id: orderData.id, amount: platformCommission, transaction_type: 'remittance_due', payment_reference: `COD Collection (${Math.round(commissionRate * 100)}% App Fee)` },
        { wallet_id: storeWallet.id, order_id: orderData.id, amount: storeEarnings, transaction_type: 'earning', payment_reference: 'Store Earning (COD Order)' }
      ]);

      if (ledgerError) console.error('LEDGER INSERT FAILED:', ledgerError.message);

    } else {
      const { data: freshRiderWallet } = await supabase
        .from('wallets')
        .select('available_balance')
        .eq('id', riderWallet.id)
        .single();

      const { data: freshStoreWallet } = await supabase
        .from('wallets')
        .select('available_balance')
        .eq('id', storeWallet.id)
        .single();

      const currentRiderBalance = Number(freshRiderWallet?.available_balance || 0);
      const currentStoreBalance = Number(freshStoreWallet?.available_balance || 0);

      await supabase.from('wallets').update({ available_balance: currentRiderBalance + Number(riderEarnings) }).eq('id', riderWallet.id);
      await supabase.from('wallets').update({ available_balance: currentStoreBalance + Number(storeEarnings) }).eq('id', storeWallet.id);

      // Insert Ledger Breakdown with Dynamic Labels
      const { error: ledgerError } = await supabase.from('ledger_transactions').insert([
        { wallet_id: riderWallet.id, order_id: orderData.id, amount: riderEarnings, transaction_type: 'earning', payment_reference: `Online Earning (${Math.round(riderRate * 100)}% Delivery Fee)` },
        { wallet_id: storeWallet.id, order_id: orderData.id, amount: storeEarnings, transaction_type: 'earning', payment_reference: 'Store Earning (Online Order)' }
      ]);

      if (ledgerError) console.error('LEDGER INSERT FAILED:', ledgerError.message);
    }
  } catch (error) {
    console.error('Wallet Distribution Error:', error);
  }
};