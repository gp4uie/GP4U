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

async function start() {
  const allowed = await verifyAccess();
  if (!allowed) {
    setStatus(role === 'doctor'
      ? 'You need to be logged in as the doctor to join this call.'
      : 'This link is invalid or has expired.');
    return;
  }

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
  document.getElementById('micBtn').textContent = micOn ? '🎤' : '🔇';
};

document.getElementById('camBtn').onclick = () => {
  camOn = !camOn;
  localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
  document.getElementById('camBtn').textContent = camOn ? '📷' : '🚫';
};

document.getElementById('fullscreenBtn').onclick = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
};

document.getElementById('endBtn').onclick = () => {
  if (currentCall) currentCall.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (peer) peer.destroy();
  if (document.fullscreenElement) document.exitFullscreen();
  document.getElementById('endedOverlay').style.display = 'flex';
};

start();
