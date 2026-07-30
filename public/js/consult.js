const params = new URLSearchParams(location.search);
const bookingId = params.get('id');
const token = params.get('token');
const role = params.get('role') === 'doctor' ? 'doctor' : 'patient';
const otherRole = role === 'doctor' ? 'patient' : 'doctor';

const statusEl = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream, peer, currentCall;
let micOn = true, camOn = true;

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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    setStatus('Could not access your camera/microphone. Please allow camera and microphone permissions and reload this page.');
    return;
  }
  localVideo.srcObject = localStream;

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
    remoteVideo.srcObject = remoteStream;
    remoteVideo.style.display = 'block';
    setStatus('');
  });
  call.on('close', () => {
    setStatus('The other participant left the call.');
    remoteVideo.style.display = 'none';
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

document.getElementById('endBtn').onclick = () => {
  if (currentCall) currentCall.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (peer) peer.destroy();
  setStatus('Call ended. You can close this window.');
  remoteVideo.style.display = 'none';
  localVideo.style.display = 'none';
};

start();
