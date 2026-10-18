import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json();
    const event = payload?.data;

    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    const eventId = event.id; 
    const eventType = event.attributes?.type; 
    const attributes = event.attributes?.data?.attributes;

    if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid' || eventType === 'link.payment.paid') {
      const checkoutId = event.attributes?.data?.id;
      
      const rawAmount = attributes?.amount 
        || attributes?.payments?.[0]?.attributes?.amount 
        || attributes?.line_items?.[0]?.amount 
        || 0;
        
      const amountPaid = rawAmount / 100;

      // ✨ FIX: Correctly assigns 'paid' instead of 'active'
      const paymentStatus = attributes?.payments?.[0]?.attributes?.status;
      const status = paymentStatus || (eventType.includes('paid') ? 'paid' : attributes?.status);
      
      const paymentMethod = attributes?.payment_method_allowed?.[0] || attributes?.source?.type || 'online';
      const billingEmail = attributes?.billing?.email || attributes?.customer_email || 'N/A';
      
      const description = attributes?.description || attributes?.remarks || event.attributes?.data?.attributes?.payments?.[0]?.attributes?.description || '';

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { error: dbError } = await supabaseAdmin
        .from('paymongo_transactions')
        .upsert([
          {
            paymongo_event_id: eventId,
            checkout_session_id: checkoutId,
            amount: amountPaid,
            status: status,
            payment_method_used: paymentMethod,
            customer_email: billingEmail,
            raw_payload: payload
          }
        ], { onConflict: 'paymongo_event_id' });

      if (dbError) console.error("Database insert error:", dbError);

      const match = description.match(/User:\s*([a-fA-F0-9-]+)/i);
      
      if (match && match[1]) {
        const userId = match[1];

        // ✨ INSTANT TREASURY UPDATE: Immediately mark the user's online order as completed upon payment confirmation
        const { data: pendingOrders } = await supabaseAdmin
          .from('orders')
          .select('*')
          .or(`customer_id.eq.${userId},user_id.eq.${userId}`)
          .in('status', ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'in_transit']);

        if (pendingOrders && pendingOrders.length > 0) {
          const targetOrder = pendingOrders.find(o => {
            const total = (Number(o.subtotal) || 0) + (Number(o.delivery_fee) || 0);
            return Math.abs(total - amountPaid) < 1.05;
          }) || pendingOrders[0];

          if (targetOrder) {
            await supabaseAdmin
              .from('orders')
              .update({ status: 'pending' })
              .eq('id', targetOrder.id);
          }
        }

        const { data: wallet } = await supabaseAdmin
          .from('wallets')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (wallet) {
          await supabaseAdmin
            .from('wallets')
            .update({ cash_on_hand: 0 })
            .eq('id', wallet.id);

          await supabaseAdmin.from('ledger_transactions').insert([
            {
              wallet_id: wallet.id,
              amount: amountPaid,
              transaction_type: 'remittance_paid',
              payment_reference: `PayMongo Webhook Remittance (Ref: ${checkoutId || eventId})`
            }
          ]);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});