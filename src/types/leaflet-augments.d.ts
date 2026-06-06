// Type augmentations for Leaflet's private/undocumented APIs used in this project.

import 'leaflet'

declare module 'leaflet' {
  interface IconDefault {
    // Private property removed to fix Vite/Next.js bundler icon path resolution.
    _getIconUrl?: string
  }

  interface Marker {
    // Private DOM element reference used to update marker icon colours in place.
    _icon: HTMLElement | null
    // Custom properties for tracking team/vehicle status on map markers.
    _teamStatus?: string
    _vehicleStatus?: string
  }

  // Leaflet-Draw created event — the `layer` property is not in @types/leaflet.
  interface DrawCreatedEvent extends LeafletEvent {
    layer: Layer
    layerType: string
  }
}
