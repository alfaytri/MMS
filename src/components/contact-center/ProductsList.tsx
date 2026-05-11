'use client'

import { Shield, ShieldAlert, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { InstalledProduct } from '@/types/orders'

function warrantyStatus(expiresAt: string | null): 'active' | 'expiring' | 'expired' {
  if (!expiresAt) return 'expired'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < 30 * 24 * 60 * 60 * 1000) return 'expiring'
  return 'active'
}

export function ProductsList({ products }: { products: InstalledProduct[] }) {
  if (products.length === 0) {
    return <p className="text-xs text-muted-foreground px-3 py-2">No installed products</p>
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {products.map((p) => {
        const status = warrantyStatus(p.warranty_expires_at)
        return (
          <div key={p.id} className="flex items-start gap-2 rounded-md border border-border p-2">
            {status === 'active'   && <Shield    className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />}
            {status === 'expiring' && <ShieldAlert className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
            {status === 'expired'  && <ShieldOff  className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{p.product_name}</p>
              {p.brand && <p className="text-xs text-muted-foreground truncate">{p.brand}{p.model ? ` · ${p.model}` : ''}</p>}
              {p.warranty_expires_at && (
                <p className="text-xs text-muted-foreground">
                  Warranty {status === 'expired' ? 'expired' : 'expires'}{' '}
                  {new Date(p.warranty_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className={`text-xs ${
                status === 'active'   ? 'text-emerald-600 border-emerald-300' :
                status === 'expiring' ? 'text-amber-600  border-amber-300'  :
                'text-muted-foreground'
              }`}
            >
              {status}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
