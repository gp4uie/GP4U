async function init() {
  const meRes = await fetch('/api/doctor/me');
  const me = await meRes.json();
  if (!me.loggedIn) {
    document.getElementById('loginNotice').style.display = 'block';
    return;
  }
  document.getElementById('editorBox').style.display = 'block';
  loadContent();
}

async function loadContent() {
  const res = await fetch('/api/content');
  const content = await res.json();
  document.getElementById('heroTitle').value = content.hero_title;
  document.getElementById('heroSubtitle').value = content.hero_subtitle;
  document.getElementById('aboutText').value = content.about_text;
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

async function saveHomepage() {
  await fetch('/api/doctor/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heroTitle: document.getElementById('heroTitle').value,
      heroSubtitle: document.getElementById('heroSubtitle').value,
      aboutText: document.getElementById('aboutText').value,
    }),
  });
  const msg = document.getElementById('homepageMsg');
  msg.textContent = 'Saved.';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

async function addPost() {
  const title = document.getElementById('newPostTitle').value;
  const body = document.getElementById('newPostBody').value;
  if (!title || !body) { alert('Please fill in both the title and body.'); return; }
  await fetch('/api/doctor/blog-posts', {
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
  await fetch(`/api/doctor/blog-posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  loadContent();
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  await fetch(`/api/doctor/blog-posts/${id}`, { method: 'DELETE' });
  loadContent();
}

init();
