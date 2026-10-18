import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, storeName } = await req.json()

    let formattedPhone = phone.trim();
    if (formattedPhone.startsWith('09')) {
      formattedPhone = '+63' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('9')) {
      formattedPhone = '+63' + formattedPhone;
    }

    const textBeeApiKey = Deno.env.get('TEXTBEE_API_KEY');
    if (!textBeeApiKey) throw new Error('TEXTBEE_API_KEY secret is missing.');

    const textBeeResponse = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST',
      headers: { 
        'x-api-key': textBeeApiKey, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        recipients: [formattedPhone], 
        message: `PAABOT: You have an available job from ${storeName || 'a store'}! Open your Driver app to accept it.` 
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