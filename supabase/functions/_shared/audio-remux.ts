// Shared audio helpers — detect mime from magic bytes and remux WebM/Opus
// into Ogg/Opus so the resulting file plays back on WhatsApp (Gupshup, WUZAPI
// and Meta Cloud API all accept ogg/opus voice notes; WebM is rejected or
// shown as "audio unavailable" on iOS).

export function bytesToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",").pop() || "" : b64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function detectMimeFromBytes(bytes: Uint8Array, fallbackMime: string): string {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return "audio/wav";
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "audio/mp4";
  return fallbackMime;
}

function readVint(data: Uint8Array, pos: number, stripMarker: boolean): { value: number; length: number } | null {
  if (pos >= data.length) return null;
  const first = data[pos];
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > data.length) return null;
  let value = stripMarker ? first & (mask - 1) : first;
  for (let i = 1; i < length; i++) value = value * 256 + data[pos + i];
  return { value, length };
}

function readUnsigned(data: Uint8Array): number {
  let v = 0;
  for (const b of data) v = v * 256 + b;
  return v;
}

function readString(data: Uint8Array): string {
  return new TextDecoder().decode(data).replace(/\0+$/g, "");
}

function parseEbmlElements(data: Uint8Array, start: number, end: number, cb: (id: number, contentStart: number, contentEnd: number) => void) {
  let pos = start;
  while (pos < end) {
    const id = readVint(data, pos, false);
    if (!id) break;
    const size = readVint(data, pos + id.length, true);
    if (!size) break;
    const contentStart = pos + id.length + size.length;
    const contentEnd = Math.min(contentStart + size.value, end);
    if (contentStart > end || contentEnd < contentStart) break;
    cb(id.value, contentStart, contentEnd);
    pos = contentEnd;
  }
}

function opusPacketSamples(packet: Uint8Array): number {
  if (!packet.length) return 960;
  const toc = packet[0];
  const config = toc >> 3;
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? Math.max(1, packet[1] ? packet[1] & 0x3f : 1) : 2;
  let samplesPerFrame: number;
  if (config < 12) samplesPerFrame = [480, 960, 1920, 2880][config & 3];
  else if (config < 16) samplesPerFrame = config & 1 ? 960 : 480;
  else samplesPerFrame = [120, 240, 480, 960][config & 3];
  return frames * samplesPerFrame;
}

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(page: Uint8Array): number {
  let crc = 0;
  for (const b of page) crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) & 0xff) ^ b]) >>> 0;
  return crc >>> 0;
}

function makeOggPage(packet: Uint8Array, headerType: number, granule: number, serial: number, seq: number): Uint8Array {
  const laces: number[] = [];
  let remaining = packet.length;
  while (remaining >= 255) { laces.push(255); remaining -= 255; }
  laces.push(remaining);
  const page = new Uint8Array(27 + laces.length + packet.length);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[4] = 0;
  page[5] = headerType;
  let gp = BigInt(granule);
  for (let i = 0; i < 8; i++) { page[6 + i] = Number(gp & 0xffn); gp >>= 8n; }
  for (let i = 0; i < 4; i++) page[14 + i] = (serial >>> (8 * i)) & 0xff;
  for (let i = 0; i < 4; i++) page[18 + i] = (seq >>> (8 * i)) & 0xff;
  page[26] = laces.length;
  page.set(laces, 27);
  page.set(packet, 27 + laces.length);
  const crc = oggCrc(page);
  for (let i = 0; i < 4; i++) page[22 + i] = (crc >>> (8 * i)) & 0xff;
  return page;
}

export function remuxWebmOpusToOgg(webm: Uint8Array): Uint8Array | null {
  let opusTrack: number | null = null;
  let opusHead: Uint8Array | null = null;

  const parseTrackEntry = (start: number, end: number) => {
    let trackNo = 0;
    let trackType = 0;
    let codec = "";
    let privateData: any = null;
    parseEbmlElements(webm, start, end, (id, cs, ce) => {
      const val = webm.subarray(cs, ce);
      if (id === 0xd7) trackNo = readUnsigned(val);
      else if (id === 0x83) trackType = readUnsigned(val);
      else if (id === 0x86) codec = readString(val);
      else if (id === 0x63a2) privateData = val;
    });
    if ((codec.includes("OPUS") || trackType === 2) && trackNo) {
      opusTrack = trackNo;
      if (privateData && readString(privateData.subarray(0, 8)) === "OpusHead") opusHead = privateData;
    }
  };

  const scanTracks = (start: number, end: number) => parseEbmlElements(webm, start, end, (id, cs, ce) => {
    if (id === 0xae) parseTrackEntry(cs, ce);
    else if (id === 0x18538067 || id === 0x1654ae6b) scanTracks(cs, ce);
  });
  scanTracks(0, webm.length);
  if (!opusTrack) opusTrack = 1;

  const packets: Uint8Array[] = [];
  const parseBlock = (cs: number, ce: number) => {
    let pos = cs;
    const track = readVint(webm, pos, true);
    if (!track) return;
    pos += track.length;
    if (pos + 3 > ce || track.value !== opusTrack) return;
    pos += 2;
    const flags = webm[pos++];
    const lacing = (flags & 0x06) >> 1;
    if (lacing === 0) packets.push(webm.slice(pos, ce));
    else if (lacing === 1 && pos < ce) {
      const count = webm[pos++] + 1;
      const sizes: number[] = [];
      let used = 0;
      for (let i = 0; i < count - 1; i++) {
        let s = 0;
        while (pos < ce) { const b = webm[pos++]; s += b; if (b !== 255) break; }
        sizes.push(s); used += s;
      }
      sizes.push(Math.max(0, ce - pos - used));
      for (const s of sizes) { if (s > 0 && pos + s <= ce) packets.push(webm.slice(pos, pos + s)); pos += s; }
    } else if (lacing === 2 && pos < ce) {
      const count = webm[pos++] + 1;
      const size = Math.floor((ce - pos) / count);
      for (let i = 0; i < count; i++) packets.push(webm.slice(pos + i * size, pos + (i + 1) * size));
    }
  };
  const scanBlocks = (start: number, end: number) => parseEbmlElements(webm, start, end, (id, cs, ce) => {
    if (id === 0xa3 || id === 0xa1) parseBlock(cs, ce);
    else if (id === 0x18538067 || id === 0x1f43b675 || id === 0xa0) scanBlocks(cs, ce);
  });
  scanBlocks(0, webm.length);
  if (!packets.length) return null;

  if (!opusHead) {
    opusHead = new Uint8Array(19);
    opusHead.set(new TextEncoder().encode("OpusHead"), 0);
    opusHead[8] = 1; opusHead[9] = 1; opusHead[10] = 56; opusHead[11] = 1;
    opusHead[12] = 0x80; opusHead[13] = 0xbb; opusHead[14] = 0; opusHead[15] = 0;
  }
  const vendor = new TextEncoder().encode("EmmelyCloud");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode("OpusTags"), 0);
  tags[8] = vendor.length & 0xff; tags[9] = (vendor.length >> 8) & 0xff; tags[10] = (vendor.length >> 16) & 0xff; tags[11] = (vendor.length >> 24) & 0xff;
  tags.set(vendor, 12);

  const serial = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let seq = 0;
  let granule = 0;
  pages.push(makeOggPage(opusHead, 2, 0, serial, seq++));
  pages.push(makeOggPage(tags, 0, 0, serial, seq++));
  for (let i = 0; i < packets.length; i++) {
    granule += opusPacketSamples(packets[i]);
    pages.push(makeOggPage(packets[i], i === packets.length - 1 ? 4 : 0, granule, serial, seq++));
  }
  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of pages) { out.set(p, offset); offset += p.length; }
  return out;
}
