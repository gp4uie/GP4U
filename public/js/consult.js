const params = new URLSearchParams(location.search);
const bookingId = params.get('id');
const token = params.get('token');
const role = params.get('role') === 'doctor' ? 'doctor' : 'patient';
const otherRole = role === 'doctor' ? 'patient' : 'doctor';
const audioOnly = params.get('mode') === 'audio';

const statusEl = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream, peer, currentCall;
let micOn = true, camOn = true;

if (audioOnly) {
  document.title = 'Audio Consultation — GP4U';
  document.body.classList.add('audio-only-call');
  setStatus('Setting up your microphone…');
}

// Line icons (same style as the rest of the site) for the call controls
const ICON_MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const ICON_MIC_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ICON_CAM = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
const ICON_CAM_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function setStatus(text) { statusEl.textContent = text; statusEl.style.display = text ? 'block' : 'none'; }

// Confirms the caller actually has a right to this booking (patient token, or a logged-in
// doctor session) before any camera/microphone access or WebRTC signalling happens — the
// booking ID in the address bar alone is not treated as sufficient proof of access.
async function verifyAccess() {
  const url = role === 'doctor'
    ? `/api/doctor/bookings/${bookingId}`
    : `/api/bookings/${bookingId}?token=${token}`;
  const res = await fetch(url);
  return res.ok;
}

// Only the doctor can start a call (see the dashboard's startCall()) — the patient's side never
// requests camera/microphone or connects on its own. It waits here, polling, until the doctor
// has actually started this booking's call.
async function waitForDoctorToStartCall() {
  if (role !== 'patient') return;
  while (true) {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call-status?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data.started) return;
      }
    } catch (err) { /* transient network issue — just keep polling */ }
    setStatus('Waiting for your GP to start the call. This page updates automatically — no need to refresh.');
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function start() {
  const allowed = await verifyAccess();
  if (!allowed) {
    setStatus(role === 'doctor'
      ? 'You need to be logged in as the doctor to join this call.'
      : 'This link is invalid or has expired.');
    return;
  }

  await waitForDoctorToStartCall();
  setStatus(audioOnly ? 'Setting up your microphone…' : 'Setting up your camera and microphone…');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    setStatus(audioOnly
      ? 'Could not access your microphone. Please allow microphone permissions and reload this page.'
      : 'Could not access your camera/microphone. Please allow camera and microphone permissions and reload this page.');
    return;
  }
  if (audioOnly) {
    document.getElementById('camBtn').style.display = 'none';
  } else {
    localVideo.srcObject = localStream;
    setupSelfView();
  }

  // Sanitised, deterministic peer IDs so the two participants can find each other for this booking only.
  const myId = `gp4u-${bookingId}-${role}`;
  const theirId = `gp4u-${bookingId}-${otherRole}`;

  peer = new Peer(myId);

  peer.on('open', () => {
    setStatus(`Waiting for the ${otherRole === 'doctor' ? 'GP' : 'patient'} to join…`);
    tryCall(theirId);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    wireCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      setTimeout(() => tryCall(theirId), 2000);
    } else {
      console.error(err);
    }
  });
}

function tryCall(theirId) {
  if (currentCall) return;
  const call = peer.call(theirId, localStream);
  if (call) wireCall(call);
  setTimeout(() => { if (!currentCall) tryCall(theirId); }, 3000);
}

function wireCall(call) {
  currentCall = call;
  call.on('stream', (remoteStream) => {
    // Still attached (and its audio still plays) even when hidden — only shown if the other
    // side actually sent a video track, so an audio-only caller doesn't see a blank video box.
    remoteVideo.srcObject = remoteStream;
    const hasRemoteVideo = remoteStream.getVideoTracks().length > 0;
    remoteVideo.style.display = hasRemoteVideo ? 'block' : 'none';
    setStatus(hasRemoteVideo ? '' : `Audio call connected with the ${otherRole === 'doctor' ? 'GP' : 'patient'}.`);
  });
  call.on('close', () => {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen();
    document.getElementById('endedOverlay').querySelector('p').textContent = `The ${otherRole === 'doctor' ? 'GP' : 'patient'} left the call.`;
    document.getElementById('endedOverlay').style.display = 'flex';
  });
}

document.getElementById('micBtn').onclick = () => {
  micOn = !micOn;
  localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
  document.getElementById('micBtn').innerHTML = micOn ? ICON_MIC : ICON_MIC_OFF;
};

document.getElementById('camBtn').onclick = () => {
  camOn = !camOn;
  localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
  document.getElementById('camBtn').innerHTML = camOn ? ICON_CAM : ICON_CAM_OFF;
};

document.getElementById('fullscreenBtn').onclick = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
};

// ---- Your own picture: drag, switch camera, minimise, close ----
const selfView = document.getElementById('selfView');
const selfChip = document.getElementById('selfChip');
const selfBtn = document.getElementById('selfBtn');
let videoDevices = [];

function setSelfState(state) {
  selfView.hidden = state !== 'open';
  selfChip.hidden = state !== 'min';
  selfBtn.hidden = audioOnly || state !== 'closed';
  if (state === 'open') keepOnScreen(selfView);
  if (state === 'min') keepOnScreen(selfChip);
}

function keepOnScreen(el) {
  if (!el.style.left) return; // still in its default corner
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(0, r.left), Math.max(0, window.innerWidth - r.width));
  const top = Math.min(Math.max(0, r.top), Math.max(0, window.innerHeight - r.height));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// Lets a finger or mouse move an element around the screen; a tap on one of its buttons never starts a drag.
function makeDraggable(el, onEnd) {
  let start = null;
  el.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('button'); if (hit && hit !== el) return;
    const r = el.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!start.moved) { start.moved = true; el.classList.add('dragging'); }
    const r = el.getBoundingClientRect();
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = Math.min(Math.max(0, start.left + dx), window.innerWidth - r.width) + 'px';
    el.style.top = Math.min(Math.max(0, start.top + dy), window.innerHeight - r.height) + 'px';
  });
  const end = () => {
    if (!start) return;
    const moved = start.moved;
    start = null;
    el.classList.remove('dragging');
    if (onEnd) onEnd(moved);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

async function refreshVideoDevices() {
  try { videoDevices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (err) { videoDevices = []; }
  document.getElementById('flipBtn').hidden = videoDevices.length < 2;
}

function updateMirror() {
  const track = localStream && localStream.getVideoTracks()[0];
  const facing = track && track.getSettings ? track.getSettings().facingMode : '';
  // The back camera is shown as it really is; the front camera and webcams are mirrored, like a mirror.
  selfView.classList.toggle('mirror', facing !== 'environment');
}

async function flipCamera() {
  if (audioOnly || !localStream) return;
  await refreshVideoDevices();
  if (videoDevices.length < 2) return;
  const oldTrack = localStream.getVideoTracks()[0];
  const currentId = oldTrack && oldTrack.getSettings ? oldTrack.getSettings().deviceId : '';
  const idx = videoDevices.findIndex((d) => d.deviceId === currentId);
  const next = videoDevices[(idx + 1) % videoDevices.length];
  if (oldTrack) oldTrack.stop(); // phones will not open a second camera while the first is still running
  let newTrack;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    newTrack = s.getVideoTracks()[0];
  } catch (err) {
    try {
      newTrack = (await navigator.mediaDevices.getUserMedia({ video: true, audio: false })).getVideoTracks()[0];
    } catch (err2) {
      setStatus('Could not switch camera.');
      setTimeout(() => setStatus(''), 2500);
      return;
    }
  }
  newTrack.enabled = camOn;
  if (oldTrack) localStream.removeTrack(oldTrack);
  localStream.addTrack(newTrack);
  localVideo.srcObject = localStream;
  // send the new picture to the other person without restarting the call
  const pc = currentCall && currentCall.peerConnection;
  if (pc) {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video') || pc.getSenders().find((s) => !s.track);
    if (sender) sender.replaceTrack(newTrack).catch(() => {});
  }
  updateMirror();
}

function setupSelfView() {
  makeDraggable(selfView);
  makeDraggable(selfChip, (moved) => { if (!moved) setSelfState('open'); });
  document.getElementById('minBtn').onclick = () => setSelfState('min');
  document.getElementById('closeSelfBtn').onclick = () => setSelfState('closed');
  selfBtn.onclick = () => setSelfState('open');
  document.getElementById('flipBtn').onclick = flipCamera;
  window.addEventListener('resize', () => { keepOnScreen(selfView); keepOnScreen(selfChip); });
  refreshVideoDevices();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', refreshVideoDevices);
  localVideo.addEventListener('loadedmetadata', updateMirror);
  updateMirror();
}

document.getElementById('endBtn').onclick = () => {
  if (currentCall) currentCall.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (peer) peer.destroy();
  if (document.fullscreenElement) document.exitFullscreen();
  document.getElementById('endedOverlay').style.display = 'flex';
};

start();
