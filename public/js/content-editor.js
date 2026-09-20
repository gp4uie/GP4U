async function init() {
  const meRes = await fetch('/api/admin/me');
  const me = await meRes.json();
  if (!me.loggedIn) {
    document.getElementById('loginNotice').style.display = 'block';
    return;
  }
  document.getElementById('editorBox').style.display = 'block';
  loadContent();
  loadServices();
}

async function loadContent() {
  const res = await fetch('/api/content');
  const content = await res.json();
  renderPosts(content.posts);
}

function renderPosts(posts) {
  document.getElementById('postsList').innerHTML = posts.map(p => `
    <div class="card" style="margin-bottom:14px;">
      <div class="form-row"><label>Title</label><input id="postTitle_${p.id}" value="${p.title.replace(/"/g, '&quot;')}"></div>
      <div class="form-row"><label>Body</label><textarea id="postBody_${p.id}">${p.body}</textarea></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" onclick="savePost(${p.id})">Save</button>
        <button class="btn btn-secondary" onclick="deletePost(${p.id})">Delete</button>
      </div>
    </div>
  `).join('');
}


async function addPost() {
  const title = document.getElementById('newPostTitle').value;
  const body = document.getElementById('newPostBody').value;
  if (!title || !body) { alert('Please fill in both the title and body.'); return; }
  await fetch('/api/admin/blog-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  document.getElementById('newPostTitle').value = '';
  document.getElementById('newPostBody').value = '';
  loadContent();
}

async function savePost(id) {
  const title = document.getElementById(`postTitle_${id}`).value;
  const body = document.getElementById(`postBody_${id}`).value;
  await fetch(`/api/admin/blog-posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  loadContent();
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  await fetch(`/api/admin/blog-posts/${id}`, { method: 'DELETE' });
  loadContent();
}

// --- Services & pricing ---
async function loadServices() {
  const res = await fetch('/api/admin/services');
  const services = await res.json();
  document.getElementById('servicesList').innerHTML = services.map(s => `
    <div class="card" style="margin-bottom:12px;">
      <div class="form-grid">
        <div class="form-row"><label>Label</label><input id="svcLabel_${s.key}" value="${s.label.replace(/"/g, '&quot;')}"></div>
        <div class="form-row"><label>Key</label><input value="${s.key}" disabled style="color:var(--ink-500);"></div>
      </div>
      <div class="form-grid">
        <div class="form-row"><label>Duration (minutes)</label><input id="svcDuration_${s.key}" type="number" value="${s.duration_mins}"></div>
        <div class="form-row"><label>Price (€)</label><input id="svcPrice_${s.key}" type="number" step="0.01" value="${(s.price_cents / 100).toFixed(2)}"></div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" onclick="saveService('${s.key}')">Save</button>
        <button class="btn btn-secondary" onclick="deleteService('${s.key}')">Delete</button>
      </div>
      <p id="svcMsg_${s.key}" style="color:#c0392b; margin-top:6px;"></p>
    </div>
  `).join('');
}

async function saveService(key) {
  const label = document.getElementById(`svcLabel_${key}`).value;
  const durationMins = Number(document.getElementById(`svcDuration_${key}`).value);
  const priceCents = Math.round(Number(document.getElementById(`svcPrice_${key}`).value) * 100);
  const res = await fetch(`/api/admin/services/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, durationMins, priceCents }),
  });
  const data = await res.json();
  const msg = document.getElementById(`svcMsg_${key}`);
  if (!res.ok) { msg.textContent = data.error; return; }
  msg.style.color = '#1c7a4b';
  msg.textContent = 'Saved.';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

async function deleteService(key) {
  if (!confirm('Remove this service? Patients will no longer be able to book it (past bookings are unaffected).')) return;
  const res = await fetch(`/api/admin/services/${key}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  loadServices();
}

async function addService() {
  const key = document.getElementById('newServiceKey').value.trim().toLowerCase().replace(/\s+/g, '_');
  const label = document.getElementById('newServiceLabel').value.trim();
  const durationMins = Number(document.getElementById('newServiceDuration').value);
  const priceCents = Math.round(Number(document.getElementById('newServicePrice').value) * 100);
  const msg = document.getElementById('serviceFormMsg');
  if (!key || !label || !durationMins || !priceCents) {
    msg.textContent = 'Please fill in all fields.';
    return;
  }
  const res = await fetch('/api/admin/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, label, durationMins, priceCents }),
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error; return; }
  msg.textContent = '';
  document.getElementById('newServiceKey').value = '';
  document.getElementById('newServiceLabel').value = '';
  document.getElementById('newServiceDuration').value = '';
  document.getElementById('newServicePrice').value = '';
  loadServices();
}

init();
