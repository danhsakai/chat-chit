// client/src/App.jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRooms, setCurrentRoom, setAuth, logout, setHistory, resetUnread, setLastReadAt, setUserRoomsState, setRoomReadStates } from './store';
import ChatRoom from './components/ChatRoom';
import Login from './components/Login';
import { socket } from './socket';

const API = 'http://localhost:4000';

export default function App() {
  const dispatch = useDispatch();
  const rooms = useSelector(s => s.rooms.list);
  const current = useSelector(s => s.rooms.current);
  const user = useSelector(s => s.auth.user);
  const messagesByRoom = useSelector(s => s.messages.byRoom);
  const unreadByRoom = useSelector(s => s.rooms.unread);
  const lastReadByRoom = useSelector(s => s.rooms.lastReadAt);
  const readByRoom = useSelector(s => s.rooms.readByRoom || {});
  const [selectedSidebar, setSelectedSidebar] = useState('All');
  const [query, setQuery] = useState('');
  // Add Group modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const closeCreateModal = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
    setNewGroupName('');
    setIsPrivate(false);
    setCreateError('');
    setShowEditModal(false);
    setSelectedSidebar('All');
  };

  // Luôn gọi các hook trước khi return
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !user) {
      fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.user) dispatch(setAuth({ user: data.user, token }));
          else dispatch(logout());
        })
        .catch(() => dispatch(logout()));
    }
  }, [dispatch, user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/api/rooms`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const list = await res.json();

        if (Array.isArray(list) && list.length) {
          dispatch(setRooms(list));
          // join all rooms to receive realtime updates for previews/unreads
          list.forEach((r) => socket.emit('joinRoom', { roomId: r.id }));
          if (!current) dispatch(setCurrentRoom(list[0].id));
          // Preload read states per room for double-tick logic
          for (const r of list) {
            try {
              const resRS = await fetch(`${API}/api/user-rooms/room/${r.id}`);
              const states = await resRS.json();
              if (Array.isArray(states)) dispatch(setRoomReadStates({ roomId: r.id, states }));
            } catch (_) {}
          }
        } else {
          const cr = await fetch(`${API}/api/rooms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ name: 'General' })
          });
          const { id } = await cr.json();
          const res2 = await fetch(`${API}/api/rooms`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          const list2 = await res2.json();
          dispatch(setRooms(list2));
          list2.forEach((r) => socket.emit('joinRoom', { roomId: r.id }));
          dispatch(setCurrentRoom(id || list2[0]?.id));
          // Preload read states for newly created/loaded rooms
          for (const r of list2) {
            try {
              const resRS = await fetch(`${API}/api/user-rooms/room/${r.id}`);
              const states = await resRS.json();
              if (Array.isArray(states)) dispatch(setRoomReadStates({ roomId: r.id, states }));
            } catch (_) {}
          }
        }
      } catch (e) {
        console.error('Load rooms failed:', e);
      }
    })();
  }, [dispatch, user]);

  // Load last messages for each room to populate previews
  useEffect(() => {
    if (!user || !rooms?.length) return;
    const controller = new AbortController();
    (async () => {
      for (const r of rooms) {
        try {
          const res = await fetch(`${API}/api/messages/${r.id}`, { signal: controller.signal });
          const msgs = await res.json();
          if (Array.isArray(msgs)) dispatch(setHistory({ roomId: r.id, messages: msgs }));
        } catch (_) {
          // ignore per-room fetch errors
        }
      }
    })();
    return () => controller.abort();
  }, [rooms, user, dispatch]);

  // Load per-user unread + lastReadAt from server
  useEffect(() => {
    if (!user || !rooms?.length) return;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/api/user-rooms`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data && typeof data === 'object') {
          const unread = {};
          const lastReadAt = {};
          for (const [roomId, v] of Object.entries(data)) {
            unread[roomId] = v.unread || 0;
            if (v.lastReadAt) lastReadAt[roomId] = v.lastReadAt;
          }
          dispatch(setUserRoomsState({ unread, lastReadAt }));
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [user, rooms, dispatch]);

  // Mark current room as read when switched
  useEffect(() => {
    if (!current) return;
    dispatch(resetUnread(current));
    dispatch(setLastReadAt({ roomId: current }));
  }, [current, dispatch]);

  // Sau khi gọi hook, mới kiểm tra user để return giao diện
  if (!user) return <Login />;

  // Derived filtered + sorted rooms
  const filteredRooms = (rooms || []).filter((r) =>
    (r.name || '').toLowerCase().includes(query.trim().toLowerCase())
  );
  const sortedRooms = [...filteredRooms].sort((a, b) => {
    const aMsgs = messagesByRoom[a.id] || [];
    const bMsgs = messagesByRoom[b.id] || [];
    const aLast = aMsgs[aMsgs.length - 1]?.createdAt || a.createdAt;
    const bLast = bMsgs[bMsgs.length - 1]?.createdAt || b.createdAt;
    const at = aLast ? new Date(aLast).getTime() : 0;
    const bt = bLast ? new Date(bLast).getTime() : 0;
    return bt - at; // newest first purely by time
  });

  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const s = Math.max(1, Math.floor((now - then) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    if (w < 4) return `${w}w`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo`;
    const y = Math.floor(d / 365);
    return `${y}y`;
  }

  function truncate(text, n) {
    if (!text) return '';
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
  }

  function toMs(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    if (v && typeof v === 'object' && v.$reql_type$ === 'TIME' && typeof v.epoch_time === 'number') {
      return Math.floor(v.epoch_time * 1000);
    }
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  return (
    <div className="grid h-screen bg-slate-50 [grid-template-columns:80px_300px_1fr_340px]">
      {/* Vertical icon sidebar */}
      <nav className="flex h-full flex-col items-center bg-[#202022] border-r border-black/20 py-3">
        {/* Top: logo .png placeholder */}
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow ring-1 ring-black/30">
          <img
            src="https://www.anhnghethuatdulich.com/wp-content/uploads/2025/09/con-khi-meme.jpg"
            alt="App logo"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Middle: chat folder icons with 'All messages' first and 'Archive' last */}
        <div className="flex flex-col items-center my-auto">
        <ul className="flex flex-col items-center gap-3 mt-6">
          {/* All messages */}
          <li>
            <button
              title="All messages"
              aria-label="All messages"
              onClick={() => setSelectedSidebar('All')}
              className="group inline-flex flex-col items-center justify-center text-[#f9fafc]"
            >
              <span
                aria-selected={selectedSidebar === 'All'}
                className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]"
              >
                {/* Inbox icon */}
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 12h-5l-2 3H9l-2-3H2"/>
                  <path d="M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/>
                  <path d="M2 12v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"/>
                </svg>
                <span className="mt-0.5 text-[1rem] leading-none text-[#f9fafc]">All</span>
              </span>
            </button>
          </li>
          {/* Example tag folders */}
          {["Work", "Friends", "Family"].map((t) => (
            <li key={t}>
              <button
                title={`Folder: ${t}`}
                aria-label={`Folder: ${t}`}
                onClick={() => setSelectedSidebar(t)}
                className="group inline-flex flex-col items-center justify-center text-[#f9fafc] mt-2"
              >
                <span
                  aria-selected={selectedSidebar === t}
                  className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]"
                >
                  {/* Folder icon */}
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  </svg>
                  <span className="mt-0.5 text-[1rem] leading-none text-[#f9fafc]">{t}</span>
                </span>
              </button>
            </li>
          ))}
          {/* Archive grouped with folders (as last item) */}
          <li>
            <button
              title="Archive chat"
              aria-label="Archive chat"
              onClick={() => setSelectedSidebar('Archive')}
              className="group inline-flex flex-col items-center justify-center text-[#f9fafc]"
            >
              <span
                aria-selected={selectedSidebar === 'Archive'}
                className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]"
              >
                {/* Archive icon */}
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 7h18v4H3z"/>
                  <path d="M5 11v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>
                  <path d="M9 15h6"/>
                </svg>
                <span className="mt-0.5 text-[1rem] leading-none text-[#f9fafc]">Archive</span>
              </span>
            </button>
          </li>
        </ul>
        {/* Colored horizontal separator with extra vertical spacing */}
        <div className="mt-12 mb-12 w-10 border-t border-[#f9fafc]" />

        {/* Middle-lower: profile + edit group */}
        <div className="flex flex-col items-center gap-3">
          <button
            title="Profile"
            aria-label="Profile"
            onClick={() => setSelectedSidebar('Profile')}
            className="group inline-flex flex-col items-center justify-center text-[#f9fafc]"
          >
            <span
              aria-selected={selectedSidebar === 'Profile'}
              className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]"
            >
              {/* User icon */}
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5z"/>
                <path d="M3 21a9 9 0 0 1 18 0"/>
              </svg>
              <span className="mt-0.5 text-[1rem] leading-none text-[#f9fafc]">Profile</span>
            </span>
          </button>
          <button
            title="Edit"
            aria-label="Edit"
            onClick={() => { setSelectedSidebar('Edit'); setShowEditModal(true); }}
            className="group inline-flex flex-col items-center justify-center text-[#f9fafc]"
          >
            <span
              aria-selected={selectedSidebar === 'Edit'}
              className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]"
            >
              {/* Pencil icon */}
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
              <span className="mt-0.5 text-[1rem] leading-none text-[#f9fafc]">Edit</span>
            </span>
          </button>
        </div>
        </div>
        {/* Push logout to bottom via centering wrapper above */}
        <button
          title="Logout"
          aria-label="Logout"
          onClick={() => {
            localStorage.removeItem('token');
            dispatch(logout());
          }}
          className="mb-1 group inline-flex flex-col items-center justify-center text-[#f9fafc]"
        >
          <span className="rounded-lg px-2 py-2 flex flex-col items-center transition-colors hover:bg-[#464646] aria-selected:bg-[#464646]">
            {/* Logout icon */}
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
              <path d="M17 16l4-4-4-4"/>
              <path d="M7 12h14"/>
            </svg>
            <span className="mt-0.5 text-[1.1rem] leading-none text-[#f9fafc]">Logout</span>
          </span>
        </button>
      </nav>

      {/* Column 1: Group list with search and previews */}
      <aside className="border-r border-slate-200 p-4 bg-white shadow-sm flex flex-col gap-3 overflow-hidden">
        {/* Search bar */}
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhóm..."
            className="text-body w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* Group chat list */}
        <ul className="list-none p-0 m-0 flex-1 overflow-auto divide-y divide-slate-100">
          {sortedRooms.map((r) => {
            const msgs = messagesByRoom[r.id] || [];
            const last = msgs[msgs.length - 1];
            const isMine = last && last.userId === user?.id;
            const senderLabel = isMine ? 'You' : (last?.userId || '');
            let previewText;
            if (last?.text) previewText = truncate(last.text, 60);
            else if (Array.isArray(last?.attachments) && last.attachments.length) {
              const imgs = last.attachments.filter(a => (a?.type === 'image') || ((a?.mime || '').startsWith('image/')));
              if (imgs.length > 1) previewText = `[Photos] ${imgs.length}`;
              else if (imgs.length === 1) previewText = '[Photo]';
              else previewText = `[Files] ${last.attachments.length}`;
            } else if (last?.type === 'image') previewText = '[Photo]';
            else if (last?.type === 'file') previewText = `[File] ${truncate(last.fileName || '', 40)}`;
            else previewText = 'Chưa có tin nhắn';
            const when = lastReadByRoom[r.id] || last?.createdAt || null;
            const unread = unreadByRoom[r.id] || 0;
            // Determine if my last message was seen by any other user
            let seenByOthers = false;
            if (isMine && last?.createdAt) {
              const map = readByRoom[r.id] || {};
              const lastMs = toMs(last.createdAt);
              for (const [uid, ts] of Object.entries(map)) {
                if (uid === String(user?.id)) continue;
                if (!ts) continue;
                const t = toMs(ts);
                if (Number.isFinite(t) && t >= lastMs) { seenByOthers = true; break; }
              }
            }
            return (
              <li key={r.id}>
                <button
                  onClick={async () => {
                    dispatch(setCurrentRoom(r.id));
                    dispatch(resetUnread(r.id));
                    dispatch(setLastReadAt({ roomId: r.id }));
                    // Persist lastReadAt server-side for per-user unread consistency
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(`${API}/api/user-rooms/read`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({ roomId: r.id })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        // Emit read receipt so others can update immediately
                        socket.emit('user:read', { roomId: r.id, userId: user?.id, lastReadAt: data?.lastReadAt });
                      }
                    } catch (_) {}
                  }}
                className={`text-body w-full rounded-xl flex items-stretch gap-3 px-2 py-3 transition-colors ${
                  current === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                  {/* Avatar */}
                  {r.avatar ? (
                    <img
                      src={r.avatar}
                      alt={r.name || 'room avatar'}
                      className="w-10 h-10 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-700 font-bold">
                      {(r.name || '#').slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  {/* Middle: name + last message */}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-bold text-slate-900 truncate">{r.name || r.id}</span>
                    </div>
                    <div className="text-[1rem] preview-text text-slate-600 truncate">
                      {last ? (
                        <>
                          <span className="font-bold" style={{ color: '#7678ed' }}>{senderLabel}:</span>{' '}
                          <span>{previewText}</span>
                        </>
                      ) : (
                        <span>Chưa có tin nhắn</span>
                      )}
                    </div>
                  </div>

                  {/* Right: status/time and unread */}
                  <div className="flex flex-col items-end justify-between min-w-[56px]">
                    <div className="text-[0.9rem] flex items-center gap-1 text-xs text-slate-500">
                      {/* Status icon: single tick (sent) or double tick (seen) for my last message */}
                      {isMine ? (
                        seenByOthers ? (
                          // double check
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 6L10 13l-3-3" />
                            <path d="M20 7l-8 8-4-4" />
                          </svg>
                        ) : (
                          // single check
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )
                      ) : null}
                      <span>{timeAgo(when)}</span>
                    </div>
                    {unread > 0 ? (
                      <span className="mt-1 inline-flex items-center justify-center rounded-full text-[11px] min-w-[20px] h-[20px] px-1" style={{ backgroundColor: '#ff7a55', color: '#f9fafc' }}>
                        {unread}
                      </span>
                    ) : <span className="h-[20px]" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Column 3: Chat content (moved before placeholder) */}
      <main className="bg-slate-50">
        <ChatRoom />
      </main>

      {/* Column 4: Placeholder (moved after chat) */}
      <section className="border-r border-slate-200 bg-white p-4 text-slate-600">
        <div className="h-full w-full flex items-center justify-center">
          <span className="text-sm">Cột trung gian — sẽ thiết kế sau</span>
        </div>
      </section>

      {/* Add Group Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeCreateModal}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="font-semibold text-slate-900">Create Group</div>
              <button className="p-1 text-slate-700 hover:text-slate-900" onClick={closeCreateModal} aria-label="Close">✕</button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newGroupName.trim();
                if (!name) { setCreateError('Please enter a group name'); return; }
                try {
                  setCreating(true);
                  setCreateError('');
                  const token = localStorage.getItem('token');
                  // Create with name + privacy flag
                  const res = await fetch(`${API}/api/rooms`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ name, isPrivate })
                  });
                  if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`${res.status} ${txt}`);
                  }
                  const created = await res.json();
                  // If avatar chosen, upload then update room avatar
                  if (created?.id && avatarFile) {
                    try {
                      const up = await fetch(`${API}/api/uploads/${encodeURIComponent(created.id)}?filename=${encodeURIComponent(avatarFile.name)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': avatarFile.type || 'application/octet-stream' },
                        body: avatarFile,
                      });
                      if (up.ok) {
                        const meta = await up.json();
                        await fetch(`${API}/api/rooms/${created.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                          },
                          body: JSON.stringify({ avatar: `${API}${meta.url}` })
                        });
                      }
                    } catch (_) {}
                  }
                  // refresh rooms and join/select the new one
                  const resList = await fetch(`${API}/api/rooms`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                  });
                  const list = await resList.json();
                  if (Array.isArray(list)) dispatch(setRooms(list));
                  if (created?.id) {
                    socket.emit('joinRoom', { roomId: created.id });
                    dispatch(setCurrentRoom(created.id));
                  }
                  // reset and close
                  setNewGroupName('');
                  setIsPrivate(false);
                  closeCreateModal();
                } catch (err) {
                  setCreateError(err?.message || 'Failed to create group');
                } finally {
                  setCreating(false);
                }
              }}
              className="p-4 space-y-4"
            >
              <div>
                <label htmlFor="groupName" className="block text-sm font-medium text-slate-700">Group name</label>
                <input
                  id="groupName"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Project Alpha"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input id="privacy" type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  <label htmlFor="privacy" className="text-sm text-slate-700">Private group</label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Group avatar</label>
                <div className="mt-2 flex items-center gap-3">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="avatar preview" className="w-12 h-12 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-700">A</div>
                  )}
                  <div>
                    <input
                      id="avatarFile"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0];
                        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                        if (f) {
                          setAvatarFile(f);
                          setAvatarPreview(URL.createObjectURL(f));
                        } else {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              {createError ? <div className="text-sm text-red-600">{createError}</div> : null}
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={closeCreateModal}>Cancel</button>
              <button type="submit" disabled={creating || !newGroupName.trim()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">
                  {creating ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                  )}
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
