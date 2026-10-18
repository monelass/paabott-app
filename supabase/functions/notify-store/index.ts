import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, customerName } = await req.json()

    // Format phone to E.164 (+63) format just in case
    let formattedPhone = phone.trim();
    if (formattedPhone.startsWith('09')) {
      formattedPhone = '+63' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('9')) {
      formattedPhone = '+63' + formattedPhone;
    }

    // Check for TextBee API Key
    const textBeeApiKey = Deno.env.get('TEXTBEE_API_KEY');
    if (!textBeeApiKey) throw new Error('TEXTBEE_API_KEY secret is missing.');

    // Send the SMS via TextBee
    const textBeeResponse = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST',
      headers: { 
        'x-api-key': textBeeApiKey, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        // NOTE: If you previously used a deviceId in Textbee, you can add it here. 
        // If your OTP works without it, leave it as is!
        recipients: [formattedPhone], 
        message: `PAABOT: You have a new order from ${customerName}! Open your store app to accept it.` 
      })
    })

    if (!textBeeResponse.ok) {
      const textbeeData = await textBeeResponse.text();
      throw new Error(`TextBee Error: ${textBeeResponse.status} ${textbeeData}`);
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400 
    })
  }
})