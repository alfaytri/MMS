import { NextRequest, NextResponse } from 'next/server'

const QNAS_BASE =
  'https://services.gisqatar.org.qa/server/rest/services/Vector/QARS_wgs84/MapServer/0/query'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const zone = searchParams.get('zone')
  const street = searchParams.get('street')
  const building = searchParams.get('building')

  if (!zone || !street || !building) {
    return NextResponse.json({ error: 'zone, street, and building are required' }, { status: 400 })
  }

  const where = `zone_no=${encodeURIComponent(zone)} and street_no=${encodeURIComponent(street)} and building_no=${encodeURIComponent(building)}`
  const url = `${QNAS_BASE}?where=${encodeURIComponent(where)}&outFields=X_COORD,Y_COORD&returnGeometry=false&f=pjson`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
      return NextResponse.json({ error: 'QNAS service unavailable' }, { status: 502 })
    }
    const data = await res.json()
    const feature = data?.features?.[0]
    if (!feature) {
      return NextResponse.json({ found: false })
    }
    return NextResponse.json({
      found: true,
      lat: feature.attributes.Y_COORD as number,
      lng: feature.attributes.X_COORD as number,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to reach QNAS service' }, { status: 502 })
  }
}
