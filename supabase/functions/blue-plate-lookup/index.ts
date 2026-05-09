// supabase/functions/blue-plate-lookup/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const BLUE_PLATE_API_URL = Deno.env.get('BLUE_PLATE_API_URL') ?? ''
const BLUE_PLATE_API_KEY = Deno.env.get('BLUE_PLATE_API_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  const { plate } = await req.json()
  if (!plate) {
    return new Response(JSON.stringify({ error: 'plate required' }), { status: 400 })
  }

  const res = await fetch(`${BLUE_PLATE_API_URL}?plate=${encodeURIComponent(plate)}`, {
    headers: { Authorization: `Bearer ${BLUE_PLATE_API_KEY}` },
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Blue Plate not found' }), { status: 404 })
  }

  const data = await res.json()
  return new Response(
    JSON.stringify({
      unit_no: data.unit ?? '',
      building_no: data.building ?? '',
      street_no: data.street ?? '',
      zone_no: data.zone ?? '',
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
})
