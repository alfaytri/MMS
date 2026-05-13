// supabase/functions/blue-plate-lookup/index.ts
//
// Looks up a Qatar QARS address (zone / street / building) via the public
// Qatar GIS REST service and returns WGS-84 coordinates.
//
// Service: https://services.gisqatar.org.qa/server/rest/services/Vector/QARS_wgs84/MapServer/0
// Docs:    QARS web service.docx
//
// Request body: { zone_no: number|string, street_no: number|string, building_no: number|string }
// Response:     { lat: number, lng: number }   (Y_COORD = lat, X_COORD = lng)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

const QARS_BASE =
  'https://services.gisqatar.org.qa/server/rest/services/Vector/QARS_wgs84/MapServer/0/query'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const zone_no     = body.zone_no     != null ? String(body.zone_no).trim()     : ''
  const street_no   = body.street_no   != null ? String(body.street_no).trim()   : ''
  const building_no = body.building_no != null ? String(body.building_no).trim() : ''

  if (!zone_no || !street_no || !building_no) {
    return new Response(
      JSON.stringify({ error: 'zone_no, street_no and building_no are required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  // Build the ESRI REST query — SQL WHERE clause on integer fields
  const where = `zone_no=${zone_no} and street_no=${street_no} and building_no=${building_no}`
  const params = new URLSearchParams({
    where,
    outFields:       'X_COORD,Y_COORD',
    returnGeometry:  'false',
    f:               'json',
  })

  let gisRes: Response
  try {
    gisRes = await fetch(`${QARS_BASE}?${params.toString()}`)
  } catch (e) {
    console.error('[blue-plate-lookup] network error', e)
    return new Response(
      JSON.stringify({ error: 'GIS service unreachable' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  if (!gisRes.ok) {
    const text = await gisRes.text().catch(() => '')
    console.error('[blue-plate-lookup] GIS error', gisRes.status, text)
    return new Response(
      JSON.stringify({ error: `GIS service error ${gisRes.status}` }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const gisData = await gisRes.json()

  const features: any[] = gisData?.features ?? []
  if (features.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Address not found' }),
      { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const attrs  = features[0].attributes ?? {}
  // In WGS-84: X = longitude, Y = latitude
  const lng    = parseFloat(attrs.X_COORD)
  const lat    = parseFloat(attrs.Y_COORD)

  if (isNaN(lat) || isNaN(lng)) {
    return new Response(
      JSON.stringify({ error: 'Coordinates missing in GIS response' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ lat, lng }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  )
})
