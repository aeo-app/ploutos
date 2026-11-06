/**
 * Gets a photo ready to upload: upright, at most 1600 px on its longest side and under ~900 KB, so it always goes
 * through (phones take 5-10 MB photos, and some proxies refuse bodies over 1 MB). Returns a JPEG Blob.
 */
const MAX_SIDE = 1600;
const TARGET_BYTES = 900 * 1024;
const TYPES = /^image\/(jpeg|png|webp)$/i;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back below */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}

const toBlob = (canvas, q) => new Promise(res => canvas.toBlob(res, 'image/jpeg', q));

export async function prepPhoto(file) {
  if (!file || !TYPES.test(file.type || '')) throw new Error('Use a JPG, PNG or WebP photo.');
  if (file.size > 30 * 1024 * 1024) throw new Error('That photo is over 30 MB. Choose a smaller one.');
  let src;
  try { src = await decode(file); } catch (_) { throw new Error('We could not read that photo. Try a JPG or PNG.'); }
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new Error('We could not read that photo. Try a JPG or PNG.');
  if (Math.min(sw, sh) < 240) throw new Error('That photo is too small. Use one at least 240 pixels on each side.');
  let side = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  let q = 0.86, blob = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * side)); c.height = Math.max(1, Math.round(sh * side));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);      // transparent PNGs get a white background
    ctx.drawImage(src, 0, 0, c.width, c.height);
    blob = await toBlob(c, q);
    if (blob && blob.size <= TARGET_BYTES) break;
    if (q > 0.58) q -= 0.1; else side *= 0.82;
  }
  if (src.close) src.close();
  if (!blob) throw new Error('We could not prepare that photo.');
  return blob;
}
