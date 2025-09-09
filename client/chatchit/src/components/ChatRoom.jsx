// client/src/components/ChatRoom.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setHistory, addMessage } from '../store';
import { socket } from '../socket';
import SearchIcon from './icons/SearchIcon';
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ChatRoom({ onOpenDetails }) {
  const dispatch = useDispatch();
  const roomId = useSelector(s => s.rooms.current);
  const rooms = useSelector(s => s.rooms.list || []);
  const messages = useSelector(s => s.messages.byRoom[roomId] || []);
  const [text, setText] = useState('');
  const user = useSelector(s => s.auth.user);
  const [memberCount, setMemberCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [readStates, setReadStates] = useState([]); // [{ userId, lastReadAt }]
  const [userMap, setUserMap] = useState({}); // id -> { id, name, avatar }
  const [openViewerKey, setOpenViewerKey] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const listRef = useRef(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  // Preview modal state for sending media like Telegram
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState([]); // [{ file, url, caption }]
  // In-chat search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const [highlightId, setHighlightId] = useState(null);

  const searchResults = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return [];
    const res = [];
    for (const m of messages || []) {
      const key = m.id || `${m.roomId}-${m.createdAt}-${m.userId}`;
      let addedText = false;
      let addedFile = false;
      const push = (label, kind) => res.push({ key, label, kind, time: m.createdAt, userId: m.userId });
      if (typeof m.text === 'string' && m.text.toLowerCase().includes(q)) {
        push(m.text, 'text');
        addedText = true;
      }
      if (!addedFile && typeof m.fileName === 'string' && m.fileName.toLowerCase().includes(q)) {
        const kind = (m.mime || '').startsWith('image/') || m.type === 'image' ? 'image' : 'file';
        push(m.fileName, kind);
        addedFile = true;
      }
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          if (!addedFile && typeof a?.fileName === 'string' && a.fileName.toLowerCase().includes(q)) {
            const kind = (a?.mime || '').startsWith('image/') || a?.type === 'image' ? 'image' : 'file';
            push(a.fileName, kind);
            addedFile = true;
          }
        }
      }
    }
    return res.sort((a, b) => (new Date(b.time).getTime() || 0) - (new Date(a.time).getTime() || 0)).slice(0, 50);
  }, [messages, searchQuery]);

  const getUserName = (uid) => (userMap[uid]?.name || uid);

  const jumpToKey = (key) => {
    const el = document.getElementById(`msg-${key}`);
    const list = listRef.current;
    if (el && list) {
      try {
        const elRect = el.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const offsetTop = elRect.top - listRect.top; // position of el within the scroll container
        const targetTop = list.scrollTop + offsetTop - Math.max(0, (list.clientHeight - el.offsetHeight) / 2);
        list.scrollTo({ top: targetTop, behavior: 'smooth' });
      } catch (_) {
        // Fallback to native behavior
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    } else if (el) {
      // Final fallback in unlikely case listRef is missing
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    setHighlightId(key);
    setTimeout(() => setHighlightId(null), 1600);
  };

  const room = useMemo(() => rooms.find(r => r.id === roomId) || null, [rooms, roomId]);

  useEffect(() => {
    if (!roomId) return;
    socket.emit('joinRoom', { roomId });

    // tải lịch sử 50 tin gần nhất
    fetch(`${API}/api/messages/${roomId}`)
      .then(r => r.json())
      .then(msgs => dispatch(setHistory({ roomId, messages: msgs })));
  }, [roomId, dispatch]);

  // Helper: scroll only the message list container to bottom
  const scrollListToBottom = (smooth = true) => {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollHeight;
    try {
      list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    } catch (_) {
      list.scrollTop = top;
    }
  };

  // Auto scroll to bottom when messages update or room changes
  useEffect(() => {
    // use requestAnimationFrame to ensure layout updated
    requestAnimationFrame(() => scrollListToBottom(true));
  }, [messages.length, roomId]);

  // Fetch member count when room changes
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/rooms/${roomId}/members`);
        const data = await res.json();
        if (data && typeof data.memberCount === 'number') setMemberCount(data.memberCount);
      } catch (_) {
        setMemberCount(0);
      }
    })();
  }, [roomId]);

  // Presence: listen and request current online count for this room
  useEffect(() => {
    function onPresence(payload) {
      if (payload?.roomId === roomId) setOnlineCount(payload.onlineCount || 0);
    }
    socket.on('room:presence', onPresence);
    if (roomId) socket.emit('presence:get', { roomId });
    return () => {
      socket.off('room:presence', onPresence);
    };
  }, [roomId]);

  // Load read states (lastReadAt per user) for this room
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/user-rooms/room/${roomId}`);
        const list = await res.json();
        if (Array.isArray(list)) setReadStates(list);
      } catch (_) {
        setReadStates([]);
      }
    })();
  }, [roomId]);

  // Close viewer panel when switching rooms
  useEffect(() => { setOpenViewerKey(null); }, [roomId]);

  // Close on Escape
  useEffect(() => {
    if (!openViewerKey) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenViewerKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openViewerKey]);

  // Keyboard shortcuts: Ctrl/Cmd+F to open search, Enter to jump, Esc to close
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      // Open search
      if ((e.ctrlKey && !e.altKey && !e.shiftKey && k === 'f') || (e.metaKey && k === 'f')) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
      // Close search
      if (k === 'escape' && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery('');
        return;
      }
      // Jump to first result
      if (k === 'enter' && searchOpen) {
        if (searchResults.length > 0) {
          e.preventDefault();
          jumpToKey(searchResults[0].key);
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, searchResults]);

  function toMs(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return new Date(v).getTime() || 0;
    // RethinkDB TIME format
    if (v && typeof v === 'object' && ('$reql_type$' in v) && v.$reql_type$ === 'TIME' && 'epoch_time' in v) {
      return Math.floor(v.epoch_time * 1000);
    }
    // try Date
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function hhmm(v) {
    const ms = toMs(v);
    if (!ms) return '';
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function viewedAtLabel(v) {
    const ms = toMs(v);
    if (!ms) return '';
    const d = new Date(ms);
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const time = hhmm(ms);
    if (sameDay) return `Viewed at ${time}`;
    const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return `Viewed at ${time} • ${dateStr}`;
  }

  // Ensure user profiles loaded for the given ids
  async function ensureUsers(ids) {
    const need = ids.filter(id => !userMap[id]);
    if (!need.length) return;
    try {
      const res = await fetch(`http://localhost:4000/api/users?ids=${encodeURIComponent(need.join(','))}`);
      const list = await res.json();
      if (Array.isArray(list)) {
        const next = { ...userMap };
        for (const u of list) next[u.id] = { id: u.id, name: u.name || u.username || u.id, avatar: u.avatar || null };
        setUserMap(next);
      }
    } catch (_) { /* ignore */ }
  }

  // Preload profiles for all message senders in the room
  useEffect(() => {
    const ids = Array.from(new Set((messages || []).map(m => m.userId))).filter(Boolean);
    if (ids.length) ensureUsers(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, messages.length]);

  const send = async () => {
    const trimmed = text.trim();
    if (!roomId) {
      console.error('No room selected');
      return;
    }
    if (!user?.id) {
      console.error('No user');
      return;
    }
    if (!trimmed) return; // don't send empty messages

    try {
      const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const res = await fetch(`${API}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userId: user.id, text: trimmed, clientId })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Send failed: ${res.status} ${errText}`);
      }
      // Optimistic update in case changefeed latency/drops (deduped via clientId)
      dispatch(addMessage({ roomId, userId: user.id, text: trimmed, createdAt: new Date().toISOString(), clientId }));
      setText('');
      // ensure scrolled to bottom after sending quickly (messages container only)
      scrollListToBottom(true);
    } catch (e) {
      console.error(e);
    }
  };

  const uploadAndSendFiles = async (items) => {
    const list = (items || []).map((it) => (it && it.file) ? it : ({ file: it, caption: '' }));
    if (!list.length) return;
    for (const { file, caption } of list) {
      try {
        // Upload binary
        const up = await fetch(`${API}/api/uploads/${encodeURIComponent(roomId)}?filename=${encodeURIComponent(file.name)}`, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
        const meta = await up.json();
        const kind = (file.type || '').startsWith('image/') ? 'image' : 'file';
        const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        // Create message referencing uploaded file URL
        const payload = {
          roomId,
          userId: user.id,
          clientId,
          type: kind,
          url: `${API}${meta.url}`,
          fileName: meta.fileName || file.name,
          fileSize: meta.size || file.size,
          mime: meta.mime || file.type,
        };
        const captionText = (caption || '').trim();
        if (captionText) payload.text = captionText;
        const res = await fetch(`${API}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Send file message failed: ${res.status}`);
        // optimistic append
        dispatch(addMessage({ ...payload, createdAt: new Date().toISOString() }));
        scrollListToBottom(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  function openPreviewWithFiles(files) {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const items = arr.map((f) => ({ file: f, url: URL.createObjectURL(f), caption: '' }));
    setPreviewItems(items);
    setPreviewOpen(true);
  }

  function removePreviewItem(idx) {
    const items = [...previewItems];
    const [spliced] = items.splice(idx, 1);
    if (spliced?.url) URL.revokeObjectURL(spliced.url);
    setPreviewItems(items);
    if (items.length === 0) setPreviewOpen(false);
  }

  function closePreview() {
    for (const it of previewItems) { if (it?.url) URL.revokeObjectURL(it.url); }
    setPreviewItems([]);
    setPreviewOpen(false);
  }

  async function confirmSendPreview() {
    const items = previewItems.map(({ file, caption }) => ({ file, caption }));
    closePreview();
    await uploadAndSendFiles(items);
    scrollListToBottom(true);
  }

  if (!roomId) return <div>Chọn phòng để bắt đầu</div>;

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* Header: group info bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white shadow-sm">
        {/* Left: Name + stats */}
        <div className="flex items-center gap-3 min-w-0">
          {room?.avatar ? (
            <img src={room.avatar} alt={room?.name || 'room'} className="w-14 h-14 rounded-lg object-cover ring-1 ring-slate-200" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700">
              {(room?.name || '#').slice(0,1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900 leading-5 max-w-[40vw] truncate">{room?.name || roomId}</div>
            <div className="text-base text-slate-500">{memberCount} members • {onlineCount} online</div>
          </div>
        </div>
        {/* Right: actions */}
        <div className="flex items-center gap-3 text-slate-700">
          {/* Search icon */}
          <button
            title="Search in group"
            className="text-slate-600 p-1 rounded-lg hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-primary-500/30"
            onClick={() => {
              setSearchOpen((v) => !v);
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <SearchIcon className="text-xl w-[32px] h-[32px] hover:scale-105" color="currentColor" title="Search in group" />
          </button>
          {/* Call icon */}
          <button title="Group call" className="text-3xl p-1 hover:text-slate-900">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="#202022" d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25c1.12.37 2.32.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57c.11.35.03.74-.25 1.02z"></path></svg>
          </button>
          {/* More (vertical dots) */}
          <button
            title="Group details"
            className="p-1 text-3xl hover:text-slate-900"
            onClick={() => {
              if (onOpenDetails) onOpenDetails();
              try {
                window.dispatchEvent(new CustomEvent('chat:openDetails', { detail: { roomId } }));
              } catch (_) {}
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="#202022" d="M12 16a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0-6a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0-6a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2"></path></svg>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-4 py-2 bg-white">
          <div className="relative">
            <SearchIcon
              className=" pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-6 h-6"
              color="currentColor"
              title=""
            />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages, files, captions…"
              className="w-full rounded-2xl bg-[#dbdcfe] pl-10 pr-10 py-2 text-base outline-none focus:ring-2 focus:ring-blue-200"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            ) : null}
          </div>
          <InlineSearchResults
            query={searchQuery}
            items={searchResults}
            onJump={jumpToKey}
            hhmm={hhmm}
            getName={getUserName}
          />
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-auto min-h-0 p-6 bg-white shadow-sm">
        {messages.map((m, idx) => {
          const mine = m.userId === user?.id;
          const createdMs = toMs(m.createdAt);
          const viewers = readStates.filter(rs => rs.userId !== m.userId && toMs(rs.lastReadAt) >= createdMs).length;
          const bubbleStyle = mine
            ? { background:'#7678ed', color:'#f9fafc' }
            : { background:'#eeeffa', color:'#202022' };
          const rowStyle = mine
            ? { justifyContent:'flex-end' }
            : { justifyContent:'flex-start' };
          const nameColor = mine ? '#e6e7ff' : '#202022';
          const metaColor = mine ? 'rgba(249,250,252,0.8)' : '#4b5563';
          const next = messages[idx + 1];
          const showAvatar = !next || next.userId !== m.userId; // only show on last of group

          const profile = userMap[m.userId] || { id: m.userId, name: m.userId, avatar: null };
          const avatarSrc = profile.avatar || `https://i.pravatar.cc/100?u=${encodeURIComponent(profile.id)}`;

          const Avatar = (
            showAvatar ? (
              <img src={avatarSrc} alt={profile.name} className="w-9 h-9 rounded-lg object-cover ring-1 ring-slate-200 shrink-0" />
            ) : (
              <div className="w-9 h-9 shrink-0" />
            )
          );

          const Bubble = (
            m.type === 'image' && m.url ? (
              (() => {
                const hasCaption = !!(m.text && String(m.text).trim().length > 0);
                return (
                  <div className="inline-block max-w-[70%] rounded-2xl p-2" style={{ background: '#7678ed', color: '#f9fafc' }}>
                    <div className="relative">
                      <a href={m.url} target="_blank" rel="noreferrer" className="block">
                        <img src={m.url} alt={m.fileName || 'image'} className="block max-w-full max-h-[420px] rounded-xl object-cover" />
                      </a>
                      {!hasCaption ? (
                        <div className="absolute bottom-1 right-2 flex items-center gap-2 text-sm">
                          <button
                            onClick={async () => {
                              const key = m.id || `${m.roomId}-${m.createdAt}-${m.userId}`;
                              if (openViewerKey === key) { setOpenViewerKey(null); return; }
                              const eligible = readStates.filter(rs => rs.userId !== m.userId && toMs(rs.lastReadAt) >= createdMs);
                              const ids = eligible.map(e => e.userId);
                              await ensureUsers(ids);
                              const list = eligible.map(e => ({ ...e, user: userMap[e.userId] || { id: e.userId, name: e.userId } }))
                                .sort((a,b) => toMs(b.lastReadAt) - toMs(a.lastReadAt));
                              setViewerList(list);
                              setOpenViewerKey(key);
                            }}
                            title={`${viewers} viewed`}
                            className="text-sm inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
                            style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                          >
                            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            {viewers}
                          </button>
                          <span className="text-sm" style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{hhmm(m.createdAt)}</span>
                        </div>
                      ) : null}
                    </div>
                    {hasCaption ? (
                      <>
                        <div className="mt-1 text-base whitespace-pre-wrap break-words" style={{ color: '#f9fafc' }}>
                          {m.text}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs justify-end" style={{ color: '#f9fafc' }}>
                          <button onClick={async () => {
                            const key = m.id || `${m.roomId}-${m.createdAt}-${m.userId}`;
                            if (openViewerKey === key) { setOpenViewerKey(null); return; }
                            const eligible = readStates.filter(rs => rs.userId !== m.userId && toMs(rs.lastReadAt) >= createdMs);
                            const ids = eligible.map(e => e.userId);
                            await ensureUsers(ids);
                            const list = eligible.map(e => ({ ...e, user: userMap[e.userId] || { id: e.userId, name: e.userId } }))
                              .sort((a,b) => toMs(b.lastReadAt) - toMs(a.lastReadAt));
                            setViewerList(list);
                            setOpenViewerKey(key);
                          }} title={`${viewers} viewed`} className="text-sm inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0">
                            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            {viewers}
                          </button>
                          <span className="text-sm">{hhmm(m.createdAt)}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })()
            ) : (
                  <div className={`rounded-2xl px-3 py-2.5 max-w-[70%] shadow-sm text-sm flex flex-col gap-1.5 ${mine ? 'bg-[#7678ed] text-[#f9fafc]' : 'bg-[#eeeffa] text-[#202022]'}`}>
                {!mine && (
                  <div className="font-bold text-sm" style={{ color: nameColor }}>
                    {profile.name}
                  </div>
                )}
                {/* message content: text and/or attachment */}
                {m.type === 'file' && m.url ? (
                  <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 bg-white/50 text-sm">
                    <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <span className="truncate max-w-[260px]">{m.fileName || 'file'}</span>
                    {m.fileSize ? <span className="text-base text-slate-500">({Math.ceil((m.fileSize)/1024)} KB)</span> : null}
                  </a>
                ) : null}
                {m.text ? (
                  <div className="text-base whitespace-pre-wrap break-words">
                    {m.text}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 self-end text-xs" style={{ color: metaColor }}>
                  {/* viewers */}
                  <button onClick={async () => {
                    const key = m.id || `${m.roomId}-${m.createdAt}-${m.userId}`;
                    if (openViewerKey === key) { setOpenViewerKey(null); return; }
                    const eligible = readStates.filter(rs => rs.userId !== m.userId && toMs(rs.lastReadAt) >= createdMs);
                    const ids = eligible.map(e => e.userId);
                    await ensureUsers(ids);
                    const list = eligible.map(e => ({ ...e, user: userMap[e.userId] || { id: e.userId, name: e.userId } }))
                      .sort((a,b) => toMs(b.lastReadAt) - toMs(a.lastReadAt));
                    setViewerList(list);
                    setOpenViewerKey(key);
                          }} title={`${viewers} viewed`} className="text-sm inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0">
                    <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    {viewers}
                  </button>
                  <span className="text-sm">{hhmm(m.createdAt)}</span>
                </div>
              </div>
            )
          );

          const key = m.id || `${m.roomId}-${m.createdAt}-${m.userId}`;
          return (
            <div
              id={`msg-${key}`}
              key={key}
              className={`mb-2 flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${highlightId === key ? 'ring-2 ring-blue-300 rounded-xl' : ''}`}
            >
              {mine ? (
                <>
                  {Bubble}
                  {Avatar}
                </>
              ) : (
                <>
                  {Avatar}
                  {Bubble}
                </>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {/* Media preview modal (Telegram-like) */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closePreview}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
              <div className="font-semibold text-slate-900">Send media</div>
              <button onClick={closePreview} className="p-1 text-slate-700 hover:text-slate-900" aria-label="Close">✕</button>
            </div>
            <div className="p-4 grid gap-4" style={{ gridTemplateColumns: previewItems.length > 1 ? 'repeat(auto-fill, minmax(160px, 1fr))' : '1fr' }}>
              {previewItems.map((it, idx) => {
                const isImage = (it.file.type || '').startsWith('image/');
                return (
                  <div key={idx} className="relative group border border-slate-200 rounded-lg overflow-hidden">
                    <button onClick={() => removePreviewItem(idx)} className="absolute top-2 right-2 z-10 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100">✕</button>
                    {isImage ? (
                      <img src={it.url} alt={it.file.name} className="block w-full max-h-[420px] object-contain bg-black" />
                    ) : (
                      <div className="p-3 flex items-center gap-2">
                        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate max-w-[260px]">{it.file.name}</div>
                          <div className="text-xs text-slate-500">{Math.ceil(it.file.size/1024)} KB</div>
                        </div>
                      </div>
                    )}
                    <div className="p-2 border-t border-slate-200">
                      <input
                        value={it.caption}
                        onChange={(e) => {
                          const next = [...previewItems];
                          next[idx] = { ...next[idx], caption: e.target.value };
                          setPreviewItems(next);
                        }}
                        placeholder="Add a caption"
                        className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={closePreview} className="px-3 py-2 rounded-md text-slate-700 hover:bg-slate-200">Cancel</button>
              <button onClick={confirmSendPreview} className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow-sm">Send {previewItems.length}</button>
            </div>
          </div>
        </div>
      )}
      {/* Viewers modal overlay */}
      {openViewerKey && (
        <div onClick={() => setOpenViewerKey(null)} className="fixed inset-0 bg-black/35 flex items-center justify-center z-50">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[80vh] overflow-auto bg-white rounded-xl shadow-2xl mx-4">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
              <div className="text-lg font-bold text-slate-900">Viewed by</div>
              <button onClick={() => setOpenViewerKey(null)} className="p-1 text-slate-700 hover:text-slate-900" aria-label="Close">✕</button>
            </div>
            <div className="p-2">
              {viewerList.length === 0 ? (
                <div className="p-4 text-slate-500 text-sm">No viewers yet</div>
              ) : (
                viewerList.map(v => (
                  <div key={`${v.userId}-${toMs(v.lastReadAt)}`} className="flex items-center gap-3 px-2 py-2 border-b last:border-b-0 border-slate-100">
                    <img src={(v.user && v.user.avatar) ? v.user.avatar : `https://i.pravatar.cc/100?u=${encodeURIComponent(v.userId)}`} alt={v.user?.name || v.userId} className="w-9 h-9 rounded-lg object-cover ring-1 ring-slate-200" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{v.user?.name || v.userId}</div>
                    </div>
                    <div className="text-xs text-slate-500">{viewedAtLabel(v.lastReadAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <div className="p-5 bg-white">
        <div className="flex items-center gap-2 bg-[#dbdcfe] rounded-2xl px-3 py-2 shadow-sm">
          {/* Attach files/photos */}
          <button
            title="Attach files or photos"
            className="p-2 rounded-lg text-slate-700 hover:text-slate-900"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach"
          >
            <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 1 1-2.83-2.83l8.13-8.13" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); openPreviewWithFiles(files); e.target.value = ''; }} />

          <input
            value={text}
            onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }}
            className="flex-1 bg-transparent px-2 py-2 text-base outline-none focus:ring-0 border-0 placeholder-slate-600"
            placeholder="Nhập tin nhắn..."
          />
          {/* Voice message */}
          <button
            title="Record voice message"
            className="p-2 rounded-lg text-slate-700 hover:text-slate-900"
            onClick={() => alert('Voice messages not implemented yet')}
            aria-label="Record voice"
          >
            <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          {/* Send */}
          <button
            onClick={send}
            disabled={!text.trim()}
            className="p-2 rounded-lg text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send"
            aria-label="Send"
          >
            <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineSearchResults({ query, items, onJump, hhmm, getName }) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded-xl bg-white shadow-sm border border-slate-200">
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-slate-500">No results</div>
      ) : (
        items.map((it, idx) => (
          <button
            key={idx}
            onClick={() => onJump(it.key)}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
          >
            {/* icon */}
            {it.kind === 'text' ? (
              <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
            ) : it.kind === 'image' ? (
              <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            ) : (
              <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium text-slate-900 truncate">{getName(it.userId)}</div>
              <div className="text-sm text-slate-600 truncate" title={it.label}>{truncateMid(it.label, 80)} • {hhmm(it.time)}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function truncateMid(text, n) {
  const s = (text || '').toString();
  if (s.length <= n) return s;
  const keep = Math.max(4, Math.floor((n - 1) / 2));
  return s.slice(0, keep) + '…' + s.slice(-keep);
}
