import { describe, it, expect } from 'vitest'
import { NAV_TREE, collectPermKeys, NOTIFICATION_AUTO_FEATURE } from '../components/master-data/PermissionTree'
import {
  NOTIFICATION_RECIPIENTS,
  getNotificationRoute,
  isActionableNotification,
  getNotificationIcon,
} from './notification-routes'

// NAV_TREE is the live permission catalog (role editor + viewer). Validate every
// notification-routing key against it, not the vestigial PERMISSION_GROUPS.
const TREE_KEYS = new Set(collectPermKeys(NAV_TREE))

describe('NOTIFICATION_RECIPIENTS', () => {
  it('every mapped feature permission exists in the live catalog (NAV_TREE)', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_RECIPIENTS)) {
      expect(TREE_KEYS.has(meta.permission), `${type} → unknown permission ${meta.permission}`).toBe(true)
    }
  })

  it('every override permission exists in NAV_TREE', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_RECIPIENTS)) {
      if (meta.override) {
        expect(TREE_KEYS.has(meta.override), `${type} → unknown override ${meta.override}`).toBe(true)
      }
    }
  })

  it('every notifyKey is a grantable key in NAV_TREE', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_RECIPIENTS)) {
      if (meta.notifyKey) {
        expect(meta.notifyKey.startsWith('notify.'), `${type} → notifyKey ${meta.notifyKey} is not a notify.* key`).toBe(true)
        expect(TREE_KEYS.has(meta.notifyKey), `${type} → notifyKey ${meta.notifyKey} not in NAV_TREE`).toBe(true)
      }
    }
  })
})

describe('NOTIFICATION_AUTO_FEATURE', () => {
  it('every auto-map key is a real notify.* key in NAV_TREE', () => {
    for (const key of Object.keys(NOTIFICATION_AUTO_FEATURE)) {
      expect(key.startsWith('notify.'), `${key} is not a notify.* key`).toBe(true)
      expect(TREE_KEYS.has(key), `${key} not in NAV_TREE`).toBe(true)
    }
  })

  it('every auto-map feature permission exists in NAV_TREE', () => {
    for (const [nk, feats] of Object.entries(NOTIFICATION_AUTO_FEATURE)) {
      for (const f of feats) {
        expect(TREE_KEYS.has(f), `${nk} → feature ${f} not in NAV_TREE`).toBe(true)
      }
    }
  })

  it('every notifyKey used by a type has an Auto-feature mapping', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_RECIPIENTS)) {
      if (meta.notifyKey) {
        expect(NOTIFICATION_AUTO_FEATURE[meta.notifyKey], `${type} notifyKey ${meta.notifyKey} has no Auto mapping`).toBeDefined()
      }
    }
  })
})

describe('transfer_rejected / transfer_cancelled routes (regression — were missing)', () => {
  it('both have a route + transfer icon + are not actionable', () => {
    for (const t of ['transfer_rejected', 'transfer_cancelled']) {
      expect(getNotificationRoute(t, null)).toBe('/master-data/warehouses')
      expect(getNotificationIcon(t)).toBe('transfer')
      expect(isActionableNotification(t)).toBe(false)
    }
  })
})
