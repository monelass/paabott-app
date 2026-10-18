import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // ✨ Extract cancelUrl here
  const { amount, description, returnUrl, email, name, cancelUrl } = await req.json()
  
  const encodedKey = btoa(`${Deno.env.get('PAYMONGO_SECRET_KEY')}:`)

  const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Basic ${encodedKey}`
    },
    body: JSON.stringify({
      data: {
        attributes: {
          description: description,
          line_items: [
            {
              currency: 'PHP',
              // ✨ THE FIX: Math.round() forces clean integers, killing floating-point bugs instantly!
              amount: Math.round(amount * 100), 
              name: description,
              quantity: 1
            }
          ],
          payment_method_types: ['card', 'gcash', 'paymaya'],
          success_url: returnUrl,
          cancel_url: cancelUrl || returnUrl, // ✨ Set the specific cancel_url here
          billing: {
            name: name || "Paabot User",
            email: email || "user@paabot.com" 
          }
        }
      }
    })
  })

  const data = await response.json()
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
})