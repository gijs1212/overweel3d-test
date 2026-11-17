import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function generateCode(prefix = 'REF') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = prefix + '-';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { order_id, discount_code } = await req.json();
    if (!order_id || !discount_code) {
      return new Response(JSON.stringify({ error: 'order_id and discount_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authorization = req.headers.get('Authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: authData } = accessToken
      ? await supabase.auth.getUser(accessToken)
      : { data: { user: null } };
    if (!authData.user) {
      return new Response(JSON.stringify({ error: 'Inloggen is verplicht' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: code } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', discount_code.toUpperCase().trim())
      .maybeSingle();

    if (!code || !code.is_referral) {
      return new Response(JSON.stringify({ ok: true, skipped: 'not-a-referral' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!code.owner_email || !code.reward_percentage) {
      return new Response(JSON.stringify({ ok: true, skipped: 'incomplete-referral' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, order_number, instant_quote_price, final_price, customer_email, applied_discount_code')
      .eq('id', order_id)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: 'order-not-found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: requesterIsAdmin } = await supabase.rpc('has_role', {
      _user_id: authData.user.id,
      _role: 'admin',
    });
    if (order.user_id !== authData.user.id && requesterIsAdmin !== true) {
      return new Response(JSON.stringify({ error: 'Geen toegang tot deze bestelling' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (order.applied_discount_code?.toUpperCase() !== code.code.toUpperCase()) {
      return new Response(JSON.stringify({ error: 'Deze referralcode is niet op de bestelling toegepast' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingReward } = await supabase
      .from('discount_codes')
      .select('code, discount_value')
      .eq('source_order_id', order.id)
      .maybeSingle();
    if (existingReward) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: 'reward-already-created',
        reward: Number(existingReward.discount_value),
        code: existingReward.code,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-referral abuse
    if (order.customer_email && order.customer_email.toLowerCase() === code.owner_email.toLowerCase()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'self-referral' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subtotal = Number(order.final_price ?? order.instant_quote_price ?? 0);
    const reward = Math.round(subtotal * (Number(code.reward_percentage) / 100) * 100) / 100;

    if (reward < 1) {
      return new Response(JSON.stringify({ ok: true, skipped: 'reward-too-small', reward }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique code
    let newCode = generateCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from('discount_codes')
        .select('id')
        .eq('code', newCode)
        .maybeSingle();
      if (!existing) break;
      newCode = generateCode();
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const { error: insertErr } = await supabase.from('discount_codes').insert({
      code: newCode,
      discount_type: 'fixed',
      discount_value: reward,
      max_uses: 1,
      times_used: 0,
      active: true,
      expires_at: expiresAt.toISOString(),
      assigned_to_email: code.owner_email,
      parent_code_id: code.id,
      source_order_id: order.id,
    });

    if (insertErr?.code === '23505') {
      return new Response(JSON.stringify({ ok: true, skipped: 'reward-already-created' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (insertErr) throw insertErr;

    // Email owner via Resend gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      const greeting = code.owner_name ? `Beste ${code.owner_name},` : 'Beste,';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#0f1b3d;">
          <h2 style="color:#1e3a5f;">U heeft een beloning ontvangen 🎉</h2>
          <p>${greeting}</p>
          <p>Iemand heeft uw referral code <strong>${code.code}</strong> gebruikt voor een bestelling bij Overweel3D. Als dank ontvangt u een persoonlijke kortingscode van <strong>€${reward.toFixed(2)}</strong>.</p>
          <div style="background:#e8edf3;padding:16px;border-radius:12px;margin:16px 0;text-align:center;">
            <div style="font-size:12px;color:#1e3a5f;">Uw kortingscode</div>
            <div style="font-size:24px;font-weight:700;letter-spacing:2px;color:#0f1b3d;">${newCode}</div>
            <div style="font-size:12px;color:#1e3a5f;margin-top:4px;">Geldig tot ${expiresAt.toLocaleDateString('nl-NL')}</div>
          </div>
          <p>De code is persoonlijk en gekoppeld aan dit e-mailadres. U kunt hem éénmalig inleveren bij een volgende bestelling.</p>
          <p>Met vriendelijke groet,<br/>Overweel3D</p>
        </div>`;

      const emailResp = await fetch(`${GATEWAY_URL}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: 'Overweel3D <info@overweel3d.gijsoverweel.nl>',
          to: [code.owner_email],
          subject: 'U heeft een beloning ontvangen van Overweel3D',
          html,
        }),
      });
      if (!emailResp.ok) {
        console.error('Referral email failed:', emailResp.status, await emailResp.text());
      }
    }

    return new Response(JSON.stringify({ ok: true, reward, code: newCode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('process-referral-reward error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

