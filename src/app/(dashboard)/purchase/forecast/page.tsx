import { redirect } from 'next/navigation'

// Forecast now lives alongside Shipments on a single page. Keep this route as a
// redirect so old links and bookmarks still land in the right place.
export default function ForecastPage() {
  redirect('/purchase/shipments')
}
