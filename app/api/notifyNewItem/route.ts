import { NextResponse } from 'next/server'
import { supabase } from '@/integrations/supabase/client'

const RESEND_API_URL = 'https://api.resend.com/v1/email'
const RESEND_API_KEY = process.env.RESEND_API_TOKEN?.trim()
if (!RESEND_API_KEY) {
  console.error('No RESEND_API_TOKEN set in environment.')
}

export async function POST(req: Request) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Resend token not configured' },
      { status: 500 }
    )
  }

  try {
    const { type, id } = await req.json()

    // fetch new item details (public record)
    let newItem: any = null
    const tables: Record<string, string> = {
      product: 'products',
      color: 'filament_colors',
      discount_code: 'discount_codes', // adjust if actual table name differs
    }
    const tableName = tables[type]
    if (!tableName)
      return NextResponse.json(
        { error: 'type is invalid' },
        { status: 400 }
      )

    const { data, error: fetchErr } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !data)
      return NextResponse.json(
        { error: 'item not found' },
        { status: 404 }
      )

    newItem = data

    // fetch all active subscribers
    const {
      data: subscribers,
      error: subErr,
    } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('active', true)

    if (subErr) throw subErr

    const emailPromises = (subscribers || []).map(async (sub) => {
      const emailPayload = {
        from: 'info@overweel.com', // change as needed
        to: sub.email,
        subject: `Nieuw ${type === 'discount_code' ? 'Kortingscode' : type === 'color' ? 'Kleur' : 'Product'} toegevoegd`,
        html: `<p>Er is een nieuwe ${type} toegevoegd:</p><p><b>${
          type === 'product'
            ? newItem.name
            : type === 'discount_code'
            ? newItem.code
            : newItem.name
        }</b></p>`,
      }

      return fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      })
    })

    await Promise.all(emailPromises)

    return NextResponse.json({ message: 'notificaties verstuurd' })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}