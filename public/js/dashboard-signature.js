// Doctor dashboard → "My signature". The doctor signs on a pad (mouse, finger or stylus) or uploads a photo/scan of a
// signature on white paper. Before saving, the paper background is made transparent and the image is cropped to the
// ink, so it sits cleanly above the doctor's name on prescriptions, certificates and referral letters.
(function () {
  const pad = document.getElementById('sigPad');
  if (!pad) return;
  const ctx = pad.getContext('2d');
  const INK = '#1b2a57';
  let hasInk = false;
  let fromUpload = false; // a photo/scan has a paper background to remove; a drawn signature has none
  let drawing = false;
  let last = null;

  const msg = (id, text, kind) => { const el = document.getElementById(id); el.textContent = text || ''; el.className = 'sig-msg' + (kind ? ' is-' + kind : ''); };
  const setHint = () => { document.getElementById('sigPadHint').style.display = hasInk ? 'none' : ''; };

  function resetPad() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pad.width, pad.height);
    hasInk = false; fromUpload = false; setHint();
  }

  const point = (e) => {
    const r = pad.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height) };
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drawing = true; last = point(e);
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* not important */ }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(last.x, last.y, 2.2, 0, Math.PI * 2); ctx.fill();
    hasInk = true; setHint(); msg('sigMsg', '');
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = point(e);
    ctx.strokeStyle = INK; ctx.lineWidth = e.pointerType === 'pen' && e.pressure ? 2.5 + e.pressure * 3 : 4.2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const stop = () => { drawing = false; last = null; };
  pad.addEventListener('pointerup', stop);
  pad.addEventListener('pointercancel', stop);
  pad.addEventListener('pointerleave', stop);

  // An uploaded photo/scan is drawn into the pad (fitted, centred) so it goes through the same clean-up as a drawn one.
  document.getElementById('sigFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { msg('sigMsg', 'Please choose a PNG or JPG image.', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { msg('sigMsg', 'That image is too large (over 15 MB).', 'error'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resetPad();
      const scale = Math.min(pad.width / img.width, pad.height / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (pad.width - w) / 2, (pad.height - h) / 2, w, h);
      URL.revokeObjectURL(url);
      hasInk = true; fromUpload = true; setHint();
      msg('sigMsg', 'Image loaded — check it below after saving. Press "Save signature" to use it.', 'ok');
    };
    img.onerror = () => { URL.revokeObjectURL(url); msg('sigMsg', 'That image could not be opened.', 'error'); };
    img.src = url;
  });

  // Paper → transparent, ink kept; then crop to the ink with a small margin and scale to at most 600×200.
  function cleanedSignature() {
    const { width: W, height: H } = pad;
    const data = ctx.getImageData(0, 0, W, H);
    const px = data.data;
    // background brightness of a photo/scan: average of opaque pixels
    let sum = 0, n = 0;
    if (fromUpload) for (let i = 0; i < px.length; i += 16) if (px[i + 3] > 0) { sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n++; }
    const threshold = n ? Math.min(205, (sum / n) * 0.78) : 205;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (px[i + 3] === 0) continue;
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum > threshold) { px[i + 3] = 0; continue; }
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0 || (maxX - minX < 12 && maxY - minY < 12)) return null;
    const work = document.createElement('canvas'); work.width = W; work.height = H;
    work.getContext('2d').putImageData(data, 0, 0);
    const m = 8;
    minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(W - 1, maxX + m); maxY = Math.min(H - 1, maxY + m);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    let scale = Math.min(1, 600 / cw, 200 / ch);
    for (let attempt = 0; attempt < 4; attempt++) {
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(cw * scale)); out.height = Math.max(1, Math.round(ch * scale));
      const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
      o.drawImage(work, minX, minY, cw, ch, 0, 0, out.width, out.height);
      const url = out.toDataURL('image/png');
      if (url.length * 0.75 < 110 * 1024) return url;
      scale *= 0.7;
    }
    return null;
  }

  function showCurrent(image) {
    const box = document.getElementById('sigCurrent');
    box.innerHTML = '';
    if (image) {
      const img = document.createElement('img'); img.src = image; img.alt = 'Your saved signature';
      box.append(img);
    } else {
      box.textContent = 'No signature yet — your documents show your typed name and IMC number only.';
    }
    document.getElementById('sigRemoveBtn').style.display = image ? '' : 'none';
    document.getElementById('sigPadTitle').textContent = image ? 'Replace your signature' : 'Add your signature';
  }

  window.loadSignature = async function () {
    msg('sigRemoveMsg', '');
    try {
      const res = await doctorFetch('/api/doctor/signature');
      const data = await res.json();
      showCurrent(data.image);
    } catch (err) {
      if (err && err.message === 'session-expired') return;
      document.getElementById('sigCurrent').textContent = 'Your signature could not be loaded just now. Please try again.';
    }
  };

  window.clearSignaturePad = function () { resetPad(); msg('sigMsg', ''); };

  window.saveSignature = async function () {
    if (!hasInk) { msg('sigMsg', 'Please sign in the box (or upload an image) first.', 'error'); return; }
    const image = cleanedSignature();
    if (!image) { msg('sigMsg', 'No signature could be found in the box. Please sign a little larger, or use a clearer photo on white paper.', 'error'); return; }
    const btn = document.getElementById('sigSaveBtn');
    btn.disabled = true;
    try {
      const res = await doctorFetch('/api/doctor/signature', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { msg('sigMsg', data.error || 'The signature could not be saved. Please try again.', 'error'); return; }
      resetPad();
      showCurrent(image);
      msg('sigMsg', 'Saved. Your signature will appear on every prescription, certificate and letter you issue from now on.', 'ok');
    } catch (err) {
      if (!(err && err.message === 'session-expired')) msg('sigMsg', 'Could not reach the server. Please try again.', 'error');
    } finally { btn.disabled = false; }
  };

  window.removeSignature = async function () {
    try {
      const res = await doctorFetch('/api/doctor/signature', { method: 'DELETE' });
      if (!res.ok) { msg('sigRemoveMsg', 'The signature could not be removed. Please try again.', 'error'); return; }
      showCurrent(null);
      msg('sigRemoveMsg', 'Removed. New documents will show your typed name only; documents already issued are unchanged.', 'ok');
    } catch (err) {
      if (!(err && err.message === 'session-expired')) msg('sigRemoveMsg', 'Could not reach the server. Please try again.', 'error');
    }
  };
})();
