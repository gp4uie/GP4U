const params = new URLSearchParams(location.search);
const bookingId = params.get('id');
const token = params.get('token');
const role = params.get('role') === 'doctor' ? 'doctor' : 'patient';
const otherRole = role === 'doctor' ? 'patient' : 'doctor';
let audioOnly = params.get('mode') === 'audio';

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

// Browsers built into apps (Gmail, Outlook, Facebook, Instagram…) often can't use the camera or microphone at all.
const IN_APP_BROWSER = /; wv\)|\bGSA\/|FBAN|FBAV|Instagram|Line\/|Outlook|\bGmail/i.test(navigator.userAgent);
function showOpenInBrowserHelp(reason) {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  statusEl.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = reason + ' Please open this page in ' + (isIOS ? 'Safari' : 'Chrome') + ': tap the menu (⋮ or ⋯) and choose "Open in ' + (isIOS ? 'Safari' : 'Chrome') + '" or "Open in browser" — or copy the link below and paste it into ' + (isIOS ? 'Safari' : 'Chrome') + '.';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn btn-primary'; btn.style.marginTop = '10px'; btn.textContent = 'Copy the link to this call';
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied — now paste it into ' + (isIOS ? 'Safari' : 'Chrome'); }
    catch (err) { window.prompt('Copy this link:', location.href); }
  });
  statusEl.append(p, btn);
  statusEl.style.display = 'block';
}

// Confirms the caller actually has a right to this booking (patient token, or a logged-in
// doctor session) before any camera/microphone access or WebRTC signalling happens — the
// booking ID in the address bar alone is not treated as sufficient proof of access.
// Returns true/false for "allowed", or 'offline' when the server couldn't be reached (so the page retries instead of
// wrongly telling the patient their link is invalid).
async function verifyAccess() {
  const url = role === 'doctor'
    ? `/api/doctor/bookings/${encodeURIComponent(bookingId)}`
    : `/api/bookings/${encodeURIComponent(bookingId)}?token=${encodeURIComponent(token)}`;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status >= 500) throw new Error('server ' + res.status);
      return res.ok;
    } catch (err) {
      setStatus('Reconnecting… (this page will continue by itself as soon as the connection is back)');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  return 'offline';
}

// Only the doctor can start a call (see the dashboard's startCall()) — the patient's side never
// requests camera/microphone or connects on its own. It waits here, polling, until the doctor
// has actually started this booking's call.
let callRoom = null;
async function waitForDoctorToStartCall() {
  if (role !== 'patient') {
    const res = await fetch(`/api/doctor/bookings/${encodeURIComponent(bookingId)}/call-room`);
    if (res.ok) callRoom = (await res.json()).room;
    return;
  }
  while (true) {
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/call-status?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.started && data.room) {
          callRoom = data.room;
          // The GP chose a phone (audio) consultation: don't switch the patient's camera on.
          if (data.mode === 'audio' && !audioOnly) { audioOnly = true; document.title = 'Audio Consultation — GP4U'; document.body.classList.add('audio-only-call'); }
          return;
        }
      }
    } catch (err) { /* transient network issue — just keep polling */ }
    setStatus('Waiting for your GP to start the call. This page updates automatically — no need to refresh.');
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function start() {
  const allowed = await verifyAccess();
  if (allowed === 'offline') {
    setStatus("We can't reach GP4U from this device right now. Please check your internet connection (try switching between Wi-Fi and mobile data), then reload this page.");
    return;
  }
  if (!allowed) {
    setStatus(role === 'doctor'
      ? 'You need to be logged in as the doctor to join this call.'
      : 'This link is invalid or has expired.');
    return;
  }

  await waitForDoctorToStartCall();
  setStatus(audioOnly ? 'Setting up your microphone…' : 'Setting up your camera and microphone…');

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showOpenInBrowserHelp(IN_APP_BROWSER
        ? 'The browser inside this app can\'t use your camera or microphone.'
        : 'This browser can\'t use your camera or microphone.');
      return;
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    if (IN_APP_BROWSER) { showOpenInBrowserHelp('The browser inside this app could not start your ' + (audioOnly ? 'microphone.' : 'camera and microphone.')); return; }
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

  // Peer IDs come from a secret room name the server gives only to the signed-in doctor and the patient-token
  // holder, so nobody who merely knows the booking reference can take a participant's place or call in.
  if (!callRoom) { setStatus('Could not set up the call. Please reload this page.'); return; }
  myId = `gp4u-${callRoom}-${role}`;
  theirId = `gp4u-${callRoom}-${otherRole}`;
  iceServers = await loadIceServers();
  if (!relayAvailable && role === 'doctor') {
    const warn = document.createElement('div');
    warn.className = 'relay-warn';
    warn.textContent = 'Video relay server not set up: calls only connect when your network and the patient’s allow a direct connection. Set it up in Admin → Setup checklist.';
    document.querySelector('.video-stage').append(warn);
  }
  openPeer();
}

// ---------------------------------------------------------------------------------------------------------------
// Connecting the two sides.
//  - The patient rings the GP (and keeps retrying until the picture/sound arrive); the GP only answers. One call,
//    never two crossing each other.
//  - A relay server (TURN, from /call-ice) carries the picture and sound when the two networks can't connect directly
//    (mobile data, many work/hospital networks). Without it a call can "connect" with no video or audio at all.
//  - A small data line between the two pages carries "camera off" / "muted" / "call ended".
//  - If one side's connection drops or the page is reloaded, the other side waits and reconnects by itself.
// ---------------------------------------------------------------------------------------------------------------
let myId, theirId, iceServers, relayAvailable = false;
let connected = false, ended = false, callStartedAt = 0, dataConn = null, retryTimer = null;
const theirName = otherRole === 'doctor' ? 'GP' : 'patient';

async function loadIceServers() {
  const url = role === 'doctor'
    ? `/api/doctor/bookings/${encodeURIComponent(bookingId)}/call-ice`
    : `/api/bookings/${encodeURIComponent(bookingId)}/call-ice?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      relayAvailable = !!data.relay;
      if (Array.isArray(data.iceServers) && data.iceServers.length) return data.iceServers;
    }
  } catch (err) { /* fall back to public STUN below */ }
  return [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
}

function openPeer() {
  if (ended) return;
  peer = new Peer(myId, { config: { iceServers, sdpSemantics: 'unified-plan' } });

  peer.on('open', () => {
    if (!connected) setStatus(`Waiting for the ${theirName} to join…`);
    if (role === 'patient') { tryCall(); clearInterval(retryTimer); retryTimer = setInterval(tryCall, 4000); }
  });

  peer.on('call', (call) => {
    // Only ever answer the other participant of this consultation.
    if (call.peer !== theirId) { call.close(); return; }
    useCall(call);
    call.answer(localStream);
  });

  peer.on('connection', (conn) => {
    if (conn.peer !== theirId) { conn.close(); return; }
    useData(conn);
  });

  // Lost touch with the connecting service (not the call itself): reconnect quietly.
  peer.on('disconnected', () => {
    if (ended || peer.destroyed) return;
    setTimeout(() => { if (!ended && peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2000);
  });

  peer.on('error', (err) => {
    if (ended) return;
    if (err.type === 'peer-unavailable') return; // the other side isn't there (yet) — the patient's retry handles it
    if (err.type === 'unavailable-id') {
      // This page's name is still held by an earlier copy of it (e.g. just reloaded) — try again in a moment.
      setStatus('Reconnecting…');
      try { peer.destroy(); } catch (e) { /* ignore */ }
      setTimeout(openPeer, 4000);
      return;
    }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      if (!connected) setStatus('Having trouble reaching the call service — retrying…');
      return;
    }
    console.error(err);
  });
}

function tryCall() {
  if (ended || connected || !peer || peer.destroyed || peer.disconnected || !peer.open) return;
  if (currentCall && Date.now() - callStartedAt < 15000) return; // give the current attempt time to connect
  const call = peer.call(theirId, localStream);
  if (!call) return;
  useCall(call);
  if (!dataConn || !dataConn.open) useData(peer.connect(theirId, { reliable: true }));
}

function useCall(call) {
  const old = currentCall;
  currentCall = call;
  callStartedAt = Date.now();
  if (old && old !== call) { try { old.close(); } catch (e) { /* ignore */ } }
  call.on('stream', (remoteStream) => { if (call === currentCall) showRemote(remoteStream); });
  const dropped = () => { if (call !== currentCall) return; currentCall = null; onDropped(); };
  call.on('close', dropped);
  call.on('error', dropped);
  watchConnection(call);
}

// Follows the actual media connection, so problems are explained instead of leaving a black screen.
function watchConnection(call) {
  const attach = () => {
    const pc = call.peerConnection;
    if (!pc) { if (call === currentCall) setTimeout(attach, 300); return; }
    const slowTimer = setTimeout(() => {
      if (call === currentCall && !iceOk()) setStatus(relayAvailable
        ? `Still connecting to the ${theirName}… If this takes more than a minute, both of you could try another connection (switch between Wi-Fi and mobile data) and reload the page.`
        : (role === 'doctor'
          ? 'The picture and sound cannot get through between these two networks, because the video relay server is not set up yet (Admin → Setup checklist). Until it is, ask the patient to join on the same kind of connection as you, or phone them.'
          : `Still connecting to the ${theirName}… If this doesn't work within a minute, please try joining on Wi-Fi instead of mobile data (or the other way round) and reload this page.`));
    }, 20000);
    pc.addEventListener('iceconnectionstatechange', () => {
      if (call !== currentCall) return;
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        clearTimeout(slowTimer);
        if (remoteVideo.srcObject) { setStatus(audioOnly || !hasRemoteVideo() ? `Call connected with the ${theirName}.` : ''); playRemote(); }
      } else if (st === 'disconnected') {
        setStatus('The connection is unstable — trying to recover…');
      } else if (st === 'failed') {
        clearTimeout(slowTimer);
        connected = false;
        setStatus(relayAvailable
          ? 'The connection dropped — reconnecting…'
          : `The video could not connect between your network and the ${theirName}'s. Retrying… (switching between Wi-Fi and mobile data often helps.)`);
        if (role === 'patient') { currentCall = null; try { call.close(); } catch (e) { /* ignore */ } setTimeout(tryCall, 1500); }
      }
    });
  };
  attach();
}

function hasRemoteVideo() { const s = remoteVideo.srcObject; return !!(s && s.getVideoTracks().length); }

function iceOk() { const pc = currentCall && currentCall.peerConnection; return !!pc && ['connected', 'completed'].includes(pc.iceConnectionState); }

function showRemote(remoteStream) {
  connected = true;
  // PeerJS reports the stream once per track (sound, then picture). Re-attaching the same stream would interrupt the
  // video that is just starting (which is what made "tap to turn on" appear and then do nothing) — so attach it once.
  if (remoteVideo.srcObject !== remoteStream) remoteVideo.srcObject = remoteStream;
  remoteVideo.style.display = hasRemoteVideo() && !audioOnly ? 'block' : 'none';
  if (iceOk()) setStatus(hasRemoteVideo() && !audioOnly ? '' : `Call connected with the ${theirName}.`);
  else setStatus(`Connecting the picture and sound with the ${theirName}…`);
  playRemote();
  sendState();
  showRemoteNote();
}

// Browsers may refuse to start sound until the person taps the page. Only then is a button offered; any tap anywhere
// on the page also starts it.
const tapBtn = document.createElement('button');
tapBtn.type = 'button'; tapBtn.className = 'btn btn-primary call-tap'; tapBtn.hidden = true;
tapBtn.textContent = 'Tap to turn on the sound and picture';
tapBtn.onclick = () => playRemote();
document.querySelector('.video-stage').append(tapBtn);
let playing = false;
function playRemote() {
  if (!remoteVideo.srcObject) return;
  remoteVideo.muted = false;
  const p = remoteVideo.play();
  if (!p || !p.then) return;
  p.then(() => { playing = true; tapBtn.hidden = true; })
    .catch((err) => { if (err && err.name === 'NotAllowedError') tapBtn.hidden = false; });
}
document.addEventListener('pointerdown', () => { if (remoteVideo.srcObject && (remoteVideo.paused || !playing)) playRemote(); }, true);
remoteVideo.addEventListener('playing', () => { playing = true; tapBtn.hidden = true; });

// "Camera off" / "Muted" shown over the other person's picture.
const remoteNote = document.createElement('div');
remoteNote.className = 'remote-note'; remoteNote.hidden = true;
document.querySelector('.video-stage').append(remoteNote);
let remoteCamOn = true, remoteMicOn = true;
function showRemoteNote() {
  const bits = [];
  if (!remoteCamOn && !audioOnly) bits.push(`The ${theirName} has turned their camera off`);
  if (!remoteMicOn) bits.push(`The ${theirName} is muted`);
  remoteNote.textContent = bits.join(' · ');
  remoteNote.hidden = !bits.length || !connected;
}

function useData(conn) {
  if (!conn) return;
  conn.on('open', () => { dataConn = conn; sendState(); });
  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'state') { remoteCamOn = msg.cam !== false; remoteMicOn = msg.mic !== false; showRemoteNote(); }
    if (msg.type === 'end') endedByOther();
  });
  conn.on('close', () => { if (dataConn === conn) dataConn = null; });
  conn.on('error', () => { if (dataConn === conn) dataConn = null; });
}
function send(msg) { try { if (dataConn && dataConn.open) dataConn.send(msg); } catch (e) { /* ignore */ } }
function sendState() { send({ type: 'state', cam: camOn && !audioOnly, mic: micOn }); }

// The other side's connection went (page reloaded, network change) without them ending the call: wait for them.
function onDropped() {
  if (ended) return;
  connected = false;
  remoteNote.hidden = true;
  setStatus(`The ${theirName}'s connection dropped — reconnecting… (no need to do anything)`);
  if (role === 'patient') setTimeout(tryCall, 1500);
}

function finishCall(message) {
  ended = true;
  clearInterval(retryTimer);
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  setTimeout(() => { try { if (currentCall) currentCall.close(); if (peer) peer.destroy(); } catch (e) { /* ignore */ } }, 300);
  if (document.fullscreenElement) document.exitFullscreen();
  if (message) document.getElementById('endedOverlay').querySelector('p').textContent = message;
  document.getElementById('endedOverlay').style.display = 'flex';
}
function endedByOther() { finishCall(`The ${theirName} ended the call.`); }

// ---- Call buttons, with a short label under each so it is clear what they do ----
function labelButton(id, text) {
  const btn = document.getElementById(id);
  if (!btn.querySelector('.ico')) {
    const ico = document.createElement('span'); ico.className = 'ico';
    while (btn.firstChild) ico.append(btn.firstChild);
    const lbl = document.createElement('span'); lbl.className = 'lbl';
    btn.append(ico, lbl);
  }
  btn.querySelector('.lbl').textContent = text;
  return btn;
}
labelButton('micBtn', 'Mute');
labelButton('camBtn', 'Camera off');
labelButton('selfBtn', 'My picture');
labelButton('fullscreenBtn', 'Full screen');
labelButton('endBtn', 'End call');

document.getElementById('micBtn').onclick = () => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
  const btn = labelButton('micBtn', micOn ? 'Mute' : 'Unmute');
  btn.querySelector('.ico').innerHTML = micOn ? ICON_MIC : ICON_MIC_OFF;
  btn.classList.toggle('is-off', !micOn);
  btn.setAttribute('aria-pressed', String(!micOn));
  sendState();
};

document.getElementById('camBtn').onclick = () => {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
  const btn = labelButton('camBtn', camOn ? 'Camera off' : 'Camera on');
  btn.querySelector('.ico').innerHTML = camOn ? ICON_CAM : ICON_CAM_OFF;
  btn.classList.toggle('is-off', !camOn);
  btn.setAttribute('aria-pressed', String(!camOn));
  document.getElementById('selfView').classList.toggle('cam-off', !camOn);
  sendState();
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

// After the call: a call opened as its own window (computer) closes; a call opened in the same tab (phones — browsers
// won't let a page close a tab it didn't open) goes back to where the person came from instead.
const backUrl = role === 'doctor'
  ? `/dashboard.html?open=${encodeURIComponent(bookingId)}`
  : `/confirmation.html?id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
const openedAsWindow = !!(window.opener && !window.opener.closed);
const closeBtn = document.getElementById('closeCallBtn');
closeBtn.textContent = openedAsWindow ? 'Close window' : (role === 'doctor' ? 'Back to the dashboard' : 'Back to my booking');
closeBtn.onclick = () => {
  if (openedAsWindow) {
    window.close();
    setTimeout(() => { if (!window.closed) location.href = backUrl; }, 400); // if the browser refused to close it
  } else {
    location.href = backUrl;
  }
};

document.getElementById('endBtn').onclick = () => {
  send({ type: 'end' });
  finishCall('Call ended.');
};

start();
