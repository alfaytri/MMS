/**
 * Lossless remux: extract Opus packets from a WebM container and wrap them
 * in an OGG container. No re-encoding — the Opus frames are identical.
 *
 * WhatsApp requires audio/ogg (Opus) for voice notes. Chrome's MediaRecorder
 * only produces audio/webm. This function bridges the gap.
 */

// ── EBML helpers ─────────────────────────────────────────────────────────────

function readVintValue(buf: Uint8Array, pos: number): [value: number, len: number] {
  const b = buf[pos]
  let len = 1
  let mask = 0x80
  while (len <= 8 && !(b & mask)) { len++; mask >>= 1 }
  let val = b & (mask - 1)
  for (let i = 1; i < len; i++) val = (val * 256) + buf[pos + i]
  return [val, len]
}

function readElementId(buf: Uint8Array, pos: number): [id: number, len: number] {
  const b = buf[pos]
  let len = 1
  let mask = 0x80
  while (len <= 4 && !(b & mask)) { len++; mask >>= 1 }
  let id = b
  for (let i = 1; i < len; i++) id = (id * 256) + buf[pos + i]
  return [id, len]
}

const EBML_UNKNOWN_SIZE = [0x01FFFFFFFFFFFFFF, 0xFF, 0x7FFF, 0x3FFFFF, 0x1FFFFFFF]

function isUnknownSize(value: number, vintLen: number): boolean {
  const maxForLen = (1 << (7 * vintLen)) - 1
  return value === maxForLen
}

// IDs we care about
const ID_SEGMENT       = 0x18538067
const ID_TRACKS        = 0x1654AE6B
const ID_TRACK_ENTRY   = 0xAE
const ID_CODEC_PRIVATE = 0x63A2
const ID_CLUSTER       = 0x1F43B675
const ID_TIMESTAMP     = 0xE7
const ID_SIMPLE_BLOCK  = 0xA3

interface OpusPacket {
  data: Uint8Array
  pts: number // milliseconds
}

function parseWebm(buf: Uint8Array): { codecPrivate: Uint8Array; packets: OpusPacket[] } {
  let codecPrivate: Uint8Array | null = null
  const packets: OpusPacket[] = []
  let clusterTs = 0

  function walk(start: number, end: number, depth: number) {
    let pos = start
    while (pos < end) {
      if (pos + 2 > end) break
      const [id, idLen] = readElementId(buf, pos)
      pos += idLen
      if (pos >= end) break
      const [size, sizeLen] = readVintValue(buf, pos)
      pos += sizeLen
      const unknown = isUnknownSize(size, sizeLen)
      const dataEnd = unknown ? end : Math.min(pos + size, end)

      if (id === ID_SEGMENT || id === ID_TRACKS || id === ID_TRACK_ENTRY) {
        walk(pos, dataEnd, depth + 1)
      } else if (id === ID_CODEC_PRIVATE) {
        codecPrivate = buf.slice(pos, dataEnd)
      } else if (id === ID_CLUSTER) {
        walk(pos, dataEnd, depth + 1)
      } else if (id === ID_TIMESTAMP) {
        clusterTs = 0
        for (let i = 0; i < size; i++) clusterTs = clusterTs * 256 + buf[pos + i]
      } else if (id === ID_SIMPLE_BLOCK) {
        const [trackNum, tnLen] = readVintValue(buf, pos)
        const blockPos = pos + tnLen
        if (blockPos + 3 <= dataEnd) {
          const relTs = (buf[blockPos] << 8) | buf[blockPos + 1]
          const relTsSigned = relTs >= 0x8000 ? relTs - 0x10000 : relTs
          // flags at blockPos + 2
          const opusData = buf.slice(blockPos + 3, dataEnd)
          if (opusData.length > 0) {
            packets.push({ data: opusData, pts: clusterTs + relTsSigned })
          }
        }
      }

      pos = unknown ? end : dataEnd
    }
  }

  // Skip EBML header
  let pos = 0
  const [, idLen] = readElementId(buf, pos)
  pos += idLen
  const [headerSize, hsLen] = readVintValue(buf, pos)
  pos += hsLen + headerSize

  walk(pos, buf.length, 0)

  if (!codecPrivate) throw new Error('No Opus CodecPrivate found in WebM')
  return { codecPrivate, packets }
}

// ── OGG writer ───────────────────────────────────────────────────────────────

const OGG_CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = (r << 1) ^ ((r & 0x80000000) ? 0x04C11DB7 : 0)
    t[i] = r >>> 0
  }
  return t
})()

function oggCrc(data: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < data.length; i++)
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xFF]) >>> 0
  return crc
}

function writeLE32(buf: Uint8Array, pos: number, val: number) {
  buf[pos]     = val & 0xFF
  buf[pos + 1] = (val >>> 8) & 0xFF
  buf[pos + 2] = (val >>> 16) & 0xFF
  buf[pos + 3] = (val >>> 24) & 0xFF
}

function writeLE64(buf: Uint8Array, pos: number, val: number) {
  writeLE32(buf, pos, val >>> 0)
  writeLE32(buf, pos + 4, Math.floor(val / 0x100000000) >>> 0)
}

function makeOggPage(
  serial: number, pageSeq: number, granule: number,
  headerType: number, payload: Uint8Array
): Uint8Array {
  const numSegments = Math.ceil(payload.length / 255) || 1
  const segTable = new Uint8Array(numSegments)
  let remaining = payload.length
  for (let i = 0; i < numSegments; i++) {
    segTable[i] = remaining >= 255 ? 255 : remaining
    remaining -= segTable[i]
  }

  const headerLen = 27 + numSegments
  const page = new Uint8Array(headerLen + payload.length)
  page[0] = 0x4F; page[1] = 0x67; page[2] = 0x67; page[3] = 0x53 // "OggS"
  page[4] = 0 // version
  page[5] = headerType
  writeLE64(page, 6, granule)
  writeLE32(page, 14, serial)
  writeLE32(page, 18, pageSeq)
  // CRC at 22-25 (set to 0 for calculation)
  page[26] = numSegments
  page.set(segTable, 27)
  page.set(payload, headerLen)

  const crc = oggCrc(page)
  writeLE32(page, 22, crc)
  return page
}

// ── Opus frame duration ───────────────────────────────────────────────────────

function opusSamplesPerPacket(data: Uint8Array): number {
  if (data.length === 0) return 960
  const toc    = data[0]
  const config = (toc >> 3) & 0x1F
  const code   = toc & 0x03

  // Base frame size in samples at 48 kHz
  let frameSamples: number
  if (config < 12) {
    // SILK: configs cycle through 10 / 20 / 40 / 60 ms
    frameSamples = [480, 960, 1920, 2880][config % 4]
  } else if (config < 16) {
    // Hybrid: even = 10 ms, odd = 20 ms
    frameSamples = config % 2 === 0 ? 480 : 960
  } else {
    // CELT: configs cycle through 2.5 / 5 / 10 / 20 ms
    frameSamples = [120, 240, 480, 960][config % 4]
  }

  if (code === 0) return frameSamples           // 1 frame
  if (code === 1 || code === 2) return frameSamples * 2  // 2 frames
  // code === 3: M frames encoded in next byte bits [5:0]
  const m = data.length > 1 ? (data[1] & 0x3F) : 1
  return frameSamples * (m || 1)
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function webmOpusToOgg(webmBlob: Blob): Promise<Blob> {
  const buf = new Uint8Array(await webmBlob.arrayBuffer())
  const { codecPrivate, packets } = parseWebm(buf)

  const serial = (Math.random() * 0x7FFFFFFF) >>> 0
  let pageSeq = 0

  const pages: Uint8Array[] = []

  // Page 1: OpusHead (= CodecPrivate from WebM, which IS the OpusHead)
  pages.push(makeOggPage(serial, pageSeq++, 0, 0x02, codecPrivate))

  // Page 2: OpusTags
  const vendor = new TextEncoder().encode('MMS')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  const tagsView = new DataView(tags.buffer)
  new TextEncoder().encodeInto('OpusTags', tags)
  tagsView.setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  tagsView.setUint32(12 + vendor.length, 0, true) // 0 comments
  pages.push(makeOggPage(serial, pageSeq++, 0, 0x00, tags))

  // Opus pre-skip from the OpusHead header (bytes 10-11, little-endian)
  const preSkip = codecPrivate[10] | (codecPrivate[11] << 8)

  // Audio pages: one Opus packet per page.
  // Granule = cumulative samples at 48kHz, derived from the TOC byte of each packet.
  let granule = preSkip

  for (let i = 0; i < packets.length; i++) {
    granule += opusSamplesPerPacket(packets[i].data)
    const isLast = i === packets.length - 1
    pages.push(makeOggPage(serial, pageSeq++, granule, isLast ? 0x04 : 0x00, packets[i].data))
  }

  const totalLen = pages.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const p of pages) { out.set(p, offset); offset += p.length }

  return new Blob([out], { type: 'audio/ogg' })
}
