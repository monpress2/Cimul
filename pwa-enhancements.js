// pwa-enhancements.js - PWA + search pagination + share modal + polling + gem avatar
(function(){
  // Config
  const POLL_INTERVAL_MS = 12000; // 12s polling
  const SEARCH_PAGE_SIZE = 24;

  // register service worker (if available)
  async function registerSW(){
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered');
      } catch (e) {
        console.warn('SW registration failed', e);
      }
    }
  }

  // Gem avatar gradient generator
  function usernameGradient(username){
    const s = (username||'').toLowerCase();
    let h1 = 0, h2 = 0;
    for (let i=0;i<s.length;i++){ h1 = (h1*31 + s.charCodeAt(i)) % 360; h2 = (h2*131 + s.charCodeAt(i)) % 360; }
    h2 = (h1 + 60 + (h2 % 120)) % 360;
    return `linear-gradient(135deg, hsl(${h1} 80% 55%), hsl(${h2} 70% 45%))`;
  }

  function renderGem(username){
    const el = document.getElementById('userGem');
    if (!el) return;
    const letter = (username && username[0]) ? username[0].toUpperCase() : '?';
    el.style.background = usernameGradient(username || 'guest');
    el.style.color = '#fff';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontWeight = '800';
    el.style.borderRadius = '8px';
    el.style.width = '40px';
    el.style.height = '40px';
    el.innerText = letter;
    el.title = username || 'User';
  }

  // Simple polling for pending shares count
  let pollTimer = null;
  async function pollPendingShares(){
    try{
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;
      // count pending shares where recipient_id = me
      const res = await window.supabase.from('shares').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).eq('status','pending');
      let count = 0;
      if (res && res.count !== null) count = res.count;
      updateLibraryBadge(count);
    }catch(e){ console.warn('poll error', e); }
  }

  function startPolling(){
    if (pollTimer) clearInterval(pollTimer);
    pollPendingShares();
    pollTimer = setInterval(pollPendingShares, POLL_INTERVAL_MS);
  }

  function stopPolling(){ if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function updateLibraryBadge(count){
    const btn = document.querySelector('#tab-library');
    if (!btn) return;
    let badge = btn.querySelector('.library-badge');
    if (!badge){
      badge = document.createElement('span');
      badge.className = 'library-badge';
      badge.style.cssText = 'position:absolute; top:6px; right:calc(50% - 6px); min-width:18px; height:18px; display:flex;align-items:center;justify-content:center;padding:0 6px;border-radius:999px;background:#10b981;color:#000;font-weight:800;font-size:11px;';
      btn.style.position='relative';
      btn.appendChild(badge);
    }
    if (count && count > 0){ badge.innerText = count>99? '99+': String(count); badge.style.display='flex'; }
    else badge.style.display='none';
  }

  // Share modal UI
  function ensureShareModal(){
    if (document.getElementById('shareModal')) return;
    const html = `
      <div id="shareModal" class="modal-overlay hidden" style="z-index:300" onclick="closeShareModal(event)">
        <div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">
          <h3 style="font-weight:800;color:#fff;margin-bottom:8px">Share with friends</h3>
          <p style="color:#9ca3af;font-size:13px;margin-bottom:12px">Select a friend or search by username</p>
          <input id="shareSearchInput" type="text" placeholder="Search username" style="width:100%;padding:10px;border-radius:12px;background:#0f1720;border:1px solid rgba(255,255,255,0.06);color:#fff;margin-bottom:10px" oninput="window.shareSearchProfiles(event)">
          <div id="shareRecent" style="max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:8px"></div>
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
            <button onclick="closeShareModal()" style="background:transparent;border:0;color:#a1a1aa;padding:8px 12px;border-radius:10px">Cancel</button>
          </div>
        </div>
      </div>`;
    const div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div.firstElementChild);
  }

  function openShareModal(song){
    ensureShareModal();
    window._shareTarget = song;
    const modal = document.getElementById('shareModal');
    const recent = document.getElementById('shareRecent');
    recent.innerHTML = '<div style="color:#9ca3af">Loading recent contacts...</div>';
    modal.classList.remove('hidden');
    loadRecentContacts();
  }

  function closeShareModal(e){
    if (e && e.target && e.target.id !== 'shareModal') return;
    const modal = document.getElementById('shareModal'); if (!modal) return; modal.classList.add('hidden');
  }

  async function loadRecentContacts(){
    const recentEl = document.getElementById('shareRecent');
    recentEl.innerHTML = '';
    try{
      const { data: { session } } = await window.supabase.auth.getSession(); if (!session) { recentEl.innerHTML = '<div style="color:#9ca3af">Sign in to share</div>'; return; }
      const myId = session.user.id;
      // find recent shares where I was sender or recipient
      const sent = await window.supabase.from('shares').select('recipient_id,created_at').eq('sender_id', myId).order('created_at',{ascending:false}).limit(12);
      const received = await window.supabase.from('shares').select('sender_id,created_at').eq('recipient_id', myId).order('created_at',{ascending:false}).limit(12);
      const ids = new Set();
      const others = [];
      (sent.data||[]).forEach(r => { if (r.recipient_id) ids.add(r.recipient_id); });
      (received.data||[]).forEach(r => { if (r.sender_id) ids.add(r.sender_id); });
      if (ids.size === 0){ recentEl.innerHTML = '<div style="color:#9ca3af">No recent contacts. Search by username above.</div>'; return; }
      const idsArr = Array.from(ids).slice(0,12);
      const profiles = await window.supabase.from('profiles').select('id,username,display_name').in('id', idsArr);
      (profiles.data||[]).forEach(p => others.push(p));
      if (others.length === 0){ recentEl.innerHTML = '<div style="color:#9ca3af">No contacts found.</div>'; return; }
      others.forEach(p => {
        const btn = document.createElement('button');
        btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:#0f1720;border:1px solid rgba(255,255,255,0.03);color:#fff';
        btn.innerHTML = `<div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${usernameGradient(p.username)};font-weight:800;color:#fff">${(p.username||'?').charAt(0).toUpperCase()}</div><div style="text-align:left"><div style="font-weight:700">${p.display_name||p.username}</div><div style="font-size:12px;color:#9ca3af">@${p.username}</div></div>`;
        btn.onclick = () => sendShareTo(p.id);
        recentEl.appendChild(btn);
      });
    }catch(e){ recentEl.innerHTML = '<div style="color:#f87171">Failed to load contacts</div>'; console.warn(e); }
  }

  window.shareSearchProfiles = async function(evt){
    const q = evt.target.value.trim();
    const recentEl = document.getElementById('shareRecent');
    if (!q) return loadRecentContacts();
    recentEl.innerHTML = '<div style="color:#9ca3af">Searching…</div>';
    try{
      const { data } = await window.supabase.from('profiles').select('id,username,display_name').ilike('username', `%${q}%`).limit(20);
      recentEl.innerHTML = '';
      (data||[]).forEach(p => {
        const btn = document.createElement('button');
        btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:#0f1720;border:1px solid rgba(255,255,255,0.03);color:#fff';
        btn.innerHTML = `<div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${usernameGradient(p.username)};font-weight:800;color:#fff">${(p.username||'?').charAt(0).toUpperCase()}</div><div style="text-align:left"><div style="font-weight:700">${p.display_name||p.username}</div><div style="font-size:12px;color:#9ca3af">@${p.username}</div></div>`;
        btn.onclick = () => sendShareTo(p.id);
        recentEl.appendChild(btn);
      });
    }catch(e){ recentEl.innerHTML = '<div style="color:#f87171">Search failed</div>'; }
  };

  async function sendShareTo(recipientId){
    try{
      const song = window._shareTarget;
      const { data: { session } } = await window.supabase.auth.getSession(); if (!session) { alert('Sign in to share'); return; }
      const payload = {};
      if (song._playlistSnapshot){ payload.share = 'playlist'; payload.playlist = song._playlistSnapshot; }
      else { payload.share = 'song'; payload.song = { id: song.id, title: song.title, artist: song.artist, stream_url: song.stream_url, image: song.image, _src: song._src } }
      await window.supabase.from('shares').insert([{ sender_id: session.user.id, recipient_id: recipientId, share_type: payload.share === 'playlist' ? 'playlist' : 'song', payload }]);
      closeShareModal();
      showStatus('Shared!');
      pollPendingShares();
    }catch(e){ showStatus('Failed to send'); console.warn(e); }
  }

  // Hook into action sheet: add actionShare if not present
  function addShareActionToActionSheet(){
    const sheet = document.getElementById('actionSheet');
    if (!sheet) return;
    // check if already added
    if (sheet.querySelector('[data-action="share"]')) return;
    const container = sheet.querySelector('.p-3');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'as-item';
    div.setAttribute('data-action','share');
    div.onclick = () => { openShareModal(window.actionSheetTarget || window.currentTrack); };
    div.innerHTML = `<div class="as-icon" style="background:linear-gradient(135deg,#ff7a7a,#ffb86b)"><i class="fa-solid fa-share-nodes" style="color:#fff"></i></div><span class="text-sm text-white font-medium">Share with friends</span>`;
    // insert before the download action (if exists)
    const download = Array.from(container.children).find(c => c.innerText && c.innerText.toLowerCase().includes('save offline'));
    if (download) container.insertBefore(div, download);
    else container.appendChild(div);
  }

  // Offline helpers using LumicIDB
  async function saveSongOffline(song, onProgress){
    try{
      const uid = (song && (song._local? song._local_uid : (song._src? `${song._src}_${song.id}` : btoa(song.title+song.artist)))) || ('song_' + Date.now());
      const resp = await fetch(song.stream_url);
      if (!resp.ok) throw new Error('Failed to fetch');
      const blob = await resp.blob();
      await window.LumicIDB.putSong(uid, blob, { title: song.title, artist: song.artist, image: song.image });
      showStatus('Saved offline');
      updateOfflineCount();
      return uid;
    }catch(e){ console.warn('offline save failed', e); showStatus('Failed to save offline'); throw e; }
  }

  async function getOfflineSrc(song){
    try{
      const uid = song._local? song._local_uid : (song._src? `${song._src}_${song.id}` : null);
      if (!uid) return null;
      const rec = await window.LumicIDB.getSong(uid);
      if (!rec) return null;
      return URL.createObjectURL(rec.blob);
    }catch(e){ return null; }
  }

  async function updateOfflineCount(){
    try{
      const list = await window.LumicIDB.listSongs();
      const el = document.getElementById('offlineCount');
      if (el) el.innerText = `${list.length} songs saved`;
    }catch(e){}
  }

  // expose some helpers globally used by lumic.html
  window.LumicPWA = {
    registerSW,
    renderGem,
    startPolling,
    stopPolling,
    openShareModal,
    saveSongOffline,
    getOfflineSrc
  };

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', async () => {
    try{ await window.LumicIDB.initOfflineDB(); }catch(e){ console.warn('IDB init failed', e); }
    await registerSW();
    // render gem if profile exists
    try{
      const { data: { session } } = await window.supabase.auth.getSession();
      if (session){
        const { data: profile } = await window.supabase.from('profiles').select('username,display_name').eq('id', session.user.id).maybeSingle();
        const username = profile?.username || (session.user.email || '').split('@')[0];
        window.LumicPWA.renderGem(username);
        startPolling();
      }
    }catch(e){}
    // small delay then add share action
    setTimeout(addShareActionToActionSheet, 400);
    // wire action sheet target tracking
    window.openActionSheet = (song, ev) => { window.actionSheetTarget = song; const as = document.getElementById('actionSheet'); const overlay = document.getElementById('actionSheetOverlay'); document.getElementById('asImg').src = song.image || ''; document.getElementById('asTitle').innerText = song.title || '—'; document.getElementById('asArtist').innerText = song.artist || '—'; overlay.classList.remove('hidden'); as.classList.remove('translate-y-full'); as.classList.remove('hidden'); };
  });
})();
