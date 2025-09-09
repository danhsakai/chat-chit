// client/src/App.jsx
import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRooms, setCurrentRoom, setAuth, logout, setHistory, resetUnread, setLastReadAt, setUserRoomsState, setRoomReadStates } from './store';
import ChatRoom from './components/ChatRoom';
import SearchIcon from './components/icons/SearchIcon';
import Login from './components/Login';
import { socket } from './socket';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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
  const searchInputRef = useRef(null);
  // Add Group modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  // Right column top panel state
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  // Right column bottom panel (members) state
  const [membersOpen, setMembersOpen] = useState(true);
  const [members, setMembers] = useState([]); // [{ userId, role }]
  const [profileById, setProfileById] = useState({}); // id -> { id, name, avatar }
  const [memberQuery, setMemberQuery] = useState('');
  const [memberMenuFor, setMemberMenuFor] = useState(null); // userId or null
  const [memberMenuPos, setMemberMenuPos] = useState({ x: 0, y: 0 });
  const [expandedSections, setExpandedSections] = useState({
    photos: false,
    videos: false,
    audio: false,
    files: false,
    links: false,
    voice: false,
  });

  const toggleSection = (key) =>
    setExpandedSections((s) => {
      const isOpen = !!s[key];
      const reset = { photos: false, videos: false, audio: false, files: false, links: false, voice: false };
      if (isOpen) return reset; // collapse all if clicking the open one
      return { ...reset, [key]: true }; // open only the clicked one
    });

  // Derived: latest media/link items for current room
  const currentMsgs = (messagesByRoom && current) ? (messagesByRoom[current] || []) : [];
  function toMsLocal(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return new Date(v).getTime() || 0;
    if (v && typeof v === 'object' && v.$reql_type$ === 'TIME' && typeof v.epoch_time === 'number') return Math.floor(v.epoch_time * 1000);
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  function extractItems(messages) {
    const items = [];
    for (const m of messages) {
      const baseTime = toMsLocal(m.createdAt);
      // Single-file style message
      if (m && (m.url || m.fileName || m.type || m.mime)) {
        const kind = m.type || ((m.mime || '').startsWith('image/') ? 'image' : ((m.mime || '').startsWith('video/') ? 'video' : ((m.mime || '').startsWith('audio/') ? 'audio' : 'file')));
        items.push({
          kind,
          url: m.url || null,
          fileName: m.fileName || null,
          mime: m.mime || null,
          createdAt: baseTime,
        });
      }
      // Multi-attachment style
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          if (!a) continue;
          const kind = a.type || ((a.mime || '').startsWith('image/') ? 'image' : ((a.mime || '').startsWith('video/') ? 'video' : ((a.mime || '').startsWith('audio/') ? 'audio' : 'file')));
          items.push({
            kind,
            url: a.url || null,
            fileName: a.fileName || null,
            mime: a.mime || null,
            createdAt: baseTime,
          });
        }
      }
    }
    return items;
  }
  const all = extractItems(currentMsgs);
  const latestPhotos = all.filter(i => i.kind === 'image' || (i.mime || '').startsWith('image/'))
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  const latestVideos = all.filter(i => i.kind === 'video' || (i.mime || '').startsWith('video/'))
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  const latestAudio = all.filter(i => i.kind === 'audio' || (i.mime || '').startsWith('audio/'))
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  const latestFiles = all.filter(i => !((i.kind === 'image') || (i.kind === 'video') || (i.kind === 'audio') || (i.mime || '').startsWith('image/') || (i.mime || '').startsWith('video/') || (i.mime || '').startsWith('audio/')))
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  // Extract URLs in text for Links
  function extractLinks(messages) {
    const res = [];
    const urlRe = /https?:\/\/[^\s]+/gi;
    for (const m of messages) {
      if (!m?.text) continue;
      const ms = toMsLocal(m.createdAt);
      const matches = (m.text.match(urlRe) || []);
      for (const u of matches) res.push({ url: u, createdAt: ms });
    }
    return res.sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  }
  const latestLinks = extractLinks(currentMsgs);
  const latestVoice = all.filter(i => i.kind === 'voice')
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));

  // Current room info and role helpers
  const currentRoomObj = (rooms || []).find(r => r.id === current) || null;
  const isDirectChat = !!currentRoomObj?.isPrivate && (members?.length === 2);
  const myRole = (() => {
    const meId = String(user?.id || '');
    const me = (members || []).find(m => String(m.userId) === meId);
    return me?.role || 'member';
  })();

  // Load member list for current room
  useEffect(() => {
    if (!current) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/rooms/${current}/member-list`);
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          setMembers(list);
          return;
        }
      } catch (_) {
        // ignore and fallback
      }
      // Fallback: derive members from activity if API returns nothing
      try {
        const set = new Set();
        const msgs = messagesByRoom[current] || [];
        for (const m of msgs) if (m?.userId) set.add(String(m.userId));
        const readMap = readByRoom[current] || {};
        for (const uid of Object.keys(readMap)) if (uid) set.add(String(uid));
        if (user?.id) set.add(String(user.id));
        const derived = Array.from(set).map((userId) => ({ userId, role: 'member' }));
        setMembers(derived);
      } catch (_) {
        setMembers([]);
      }
    })();
  }, [current, messagesByRoom, readByRoom, user]);

  // Ensure user profiles for members
  useEffect(() => {
    const ids = Array.from(new Set((members || []).map(m => m.userId))).filter(Boolean);
    const missing = ids.filter(id => !profileById[id]);
    if (!missing.length) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/users?ids=${encodeURIComponent(missing.join(','))}`);
        const list = await res.json();
        if (Array.isArray(list)) {
          const map = { ...profileById };
          for (const u of list) map[u.id] = { id: u.id, name: u.name || u.username || u.id, avatar: u.avatar || null };
          setProfileById(map);
        }
      } catch (_) { /* ignore */ }
    })();
  }, [members]);

  // Compute per-user status using read receipts for this room
  const readMap = readByRoom[current] || {};
  function statusLabelFor(uid) {
    const ts = readMap[uid];
    const ms = toMs(ts);
    if (ms) {
      const diff = Date.now() - ms;
      if (diff <= 2 * 60 * 1000) return 'Online';
      return `${timeAgo(ms)} ago`;
    }
    return 'Offline';
  }

  function lastSeenMsFor(uid) {
    const ts = readMap[uid];
    const ms = toMs(ts);
    return Number.isFinite(ms) ? ms : 0;
  }

  function statusRankFor(uid) {
    const ms = lastSeenMsFor(uid);
    if (!ms) return 2; // offline/unknown
    const diff = Date.now() - ms;
    if (diff <= 2 * 60 * 1000) return 0; // online
    return 1; // recently active
  }

  const membersView = (members || []).map(m => {
    const p = profileById[m.userId] || { id: m.userId, name: m.userId, avatar: null };
    const isAdmin = (m.role === 'owner' || m.role === 'admin');
    const lastSeenMs = lastSeenMsFor(m.userId);
    const statusRank = statusRankFor(m.userId);
    return { ...m, name: p.name, avatar: p.avatar, status: statusLabelFor(m.userId), isAdmin, lastSeenMs, statusRank };
  });

  const memberQ = (memberQuery || '').trim().toLowerCase();
  const membersFiltered = memberQ
    ? membersView.filter(m => (m.name || '').toLowerCase().includes(memberQ) || (m.userId || '').toLowerCase().includes(memberQ))
    : membersView;
  const membersSorted = [...membersFiltered].sort((a, b) => {
    // Admins first
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    // Status rank: online (0), recent (1), offline (2)
    if (a.statusRank !== b.statusRank) return a.statusRank - b.statusRank;
    // More recent lastSeen first
    if (a.lastSeenMs !== b.lastSeenMs) return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    // Name ascending
    const an = (a.name || a.userId || '').toLowerCase();
    const bn = (b.name || b.userId || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  // Close member context menu on any document click
  useEffect(() => {
    const onDocClick = () => setMemberMenuFor(null);
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, []);

  async function removeMemberFromRoom(uid) {
    if (!current || !uid) return;
    if (isDirectChat) return;
    try {
      if (!window.confirm('Remove this member from the group?')) return;
      await fetch(`${API}/api/rooms/${current}/members/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => String(m.userId) !== String(uid)));
    } catch (_) {}
  }

  async function makeAdmin(uid) {
    if (!current || !uid) return;
    if (isDirectChat) return;
    try {
      if (!window.confirm('Transfer admin to this member? You will lose admin rights.')) return;
      await fetch(`${API}/api/rooms/${current}/members/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' })
      });
      const meId = String(user?.id || '');
      setMembers((prev) => prev.map((m) => {
        if (String(m.userId) === String(uid)) return { ...m, role: 'admin' };
        if (String(m.userId) === meId) return { ...m, role: 'member' };
        // Ensure only one admin remains
        if (m.role === 'admin') return { ...m, role: 'member' };
        return m;
      }));
    } catch (_) {}
  }

  async function makeVice(uid) {
    if (!current || !uid) return;
    if (isDirectChat) return;
    try {
      const currentIsVice = (members || []).some(m => String(m.userId) === String(uid) && m.role === 'vice');
      const viceCount = (members || []).filter(m => m.role === 'vice' && String(m.userId) !== String(uid)).length;
      if (!currentIsVice && viceCount >= 3) {
        window.alert('This group already has the maximum of 3 vice members.');
        return;
      }
      if (!window.confirm('Grant vice role to this member?')) return;
      await fetch(`${API}/api/rooms/${current}/members/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'vice' })
      });
      setMembers((prev) => prev.map((m) => (String(m.userId) === String(uid) ? { ...m, role: 'vice' } : m)));
    } catch (_) {}
  }

  async function removeVice(uid) {
    if (!current || !uid) return;
    if (isDirectChat) return;
    try {
      if (!window.confirm('Remove vice role from this member?')) return;
      await fetch(`${API}/api/rooms/${current}/members/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'member' })
      });
      setMembers((prev) => prev.map((m) => (String(m.userId) === String(uid) ? { ...m, role: 'member' } : m)));
    } catch (_) {}
  }

  async function sendDirectMessage(uid) {
    if (!uid) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/rooms/direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ targetId: uid })
      });
      if (!res.ok) throw new Error('Failed to open DM');
      const room = await res.json();
      // Refresh rooms, join and switch to the DM
      const resList = await fetch(`${API}/api/rooms`);
      const list = await resList.json();
      if (Array.isArray(list)) {
        dispatch(setRooms(list));
        if (room?.id) {
          socket.emit('joinRoom', { roomId: room.id });
          dispatch(setCurrentRoom(room.id));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

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
          // No rooms for this user yet; do not auto-create. Keep empty until user joins/creates.
          dispatch(setRooms([]));
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
    <div className="p-2 grid h-screen min-h-0 bg-[#202022] [grid-template-columns:60px_300px_1fr_370px]">
      {/* Vertical icon sidebar */}
      <nav className="flex h-full flex-col items-center bg-[#202022] border-r border-black/20 py-3 pl-0 pr-2">
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
                <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">All</span>
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
                  <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">{t}</span>
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
                <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">Archive</span>
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
              <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">Profile</span>
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
              <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">Edit</span>
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
            <span className="mt-0.5 text-sm leading-none text-[#f9fafc]">Logout</span>
          </span>
        </button>
      </nav>

      {/* Column 1: Group list with search and previews */}
      <aside className="p-4 bg-white shadow-sm flex flex-col gap-3 overflow-hidden rounded-l-4xl">
        {/* Search bar */}
        <div className="relative">
          {/* Search icon */}
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"
            color="currentColor"
            title=""
          />
          
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhóm..."
            ref={searchInputRef}
            className="w-full rounded-xl bg-[#dbdcfe] border border-slate-200 pl-9 pr-10 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          ) : null}
        </div>

        {/* Group chat list */}
        <ul className="list-none p-0 m-0 flex-1 overflow-auto divide-y divide-slate-100">
          {sortedRooms.map((r) => {
            const msgs = messagesByRoom[r.id] || [];
            const last = msgs[msgs.length - 1];
            const isMine = last && last.userId === user?.id;
            const senderLabel = isMine ? 'You' : (last?.userId || '');
            let previewText;
            if (last?.text) previewText = truncate(last.text, 100);
            else if (Array.isArray(last?.attachments) && last.attachments.length) {
              const imgs = last.attachments.filter(a => (a?.type === 'image') || ((a?.mime || '').startsWith('image/')));
              if (imgs.length > 1) previewText = `[Photos] ${imgs.length}`;
              else if (imgs.length === 1) previewText = '[Photo]';
              else previewText = `[Files] ${last.attachments.length}`;
            } else if (last?.type === 'image') previewText = '[Photo]';
            else if (last?.type === 'file') previewText = `[File] ${truncate(last.fileName || '', 40)}`;
            else previewText = 'Chưa có tin nhắn';
            const when = last?.createdAt || null;
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
                className={`w-full rounded-xl flex items-stretch gap-3 px-2 py-3 transition-colors ${
                  current === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                  {/* Avatar */}
                  {r.avatar ? (
                    <img
                      src={r.avatar}
                      alt={r.name || 'room avatar'}
                      className="w-14 h-14 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-700 font-bold">
                      {(r.name || '#').slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  {/* Middle: name + last message */}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-900 truncate">{r.name || r.id}</span>
                    </div>
                    <div className="text-base text-slate-600 truncate">
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
                    <div className="text-sm flex items-center gap-1 text-slate-500">
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
                      <span className="mt-1 inline-flex items-center justify-center rounded-full text-xs min-w-[20px] h-[20px] px-1" style={{ backgroundColor: '#ff7a55', color: '#f9fafc' }}>
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
      <main className="bg-slate-50 pt-2 rounded-r-4xl overflow-hidden min-h-0 h-full">
        <ChatRoom />
      </main>

      {/* Column 4: Split into two equal rows */}
      <section className="px-4 py-0 text-slate-600">
        <div
          className="h-full grid grid-rows-2 gap-4"
          style={{
            gridTemplateRows: !membersOpen
              ? '1fr 0fr'
              : ((expandedSections.photos || expandedSections.videos || expandedSections.audio || expandedSections.files || expandedSections.links || expandedSections.voice)
                ? '2fr 1fr'
                : '1fr 1fr')
          }}
        >
          {/* Top panel: Group info + Files */}
          <div className="rounded-4xl bg-[#f9fafc] overflow-hidden flex flex-col min-h-0 p-2.5">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <h3 className="text-3xl font-semibold text-slate-800">Group info</h3>
              <button
                type="button"
                aria-label={infoPanelOpen ? 'Close panel' : 'Open panel'}
                onClick={() => setInfoPanelOpen(v => !v)}
                className="p-1 text-slate-500 hover:text-slate-700"
              >
                {/* X icon */}
                {infoPanelOpen ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  // Plus icon when closed
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </button>
            </div>
            {/* Content */}
            {infoPanelOpen ? (
              <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
                {/* File title */}
                <div className="text-2xl font-bold tracking-wid mb-2">File</div>

                <ul className="space-y-1">
                  {/* Photos */}
                  <li>
                    <button
                      type="button"
                      aria-expanded={expandedSections.photos}
                      onClick={() => toggleSection('photos')}
                      className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1"
                    >
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* Photo icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="M21 15l-5-5-4 4-2-2-5 5" />
                        </svg>
                        <span className="text-base">{latestPhotos.length} photos</span>
                      </span>
                      {/* Chevron */}
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.photos ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.photos && (
                      <div className="pb-3 max-h-64 overflow-auto pr-1">
                        {latestPhotos.length === 0 ? (
                          <div className="text-base text-slate-500">No photos</div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {latestPhotos.map((ph, idx) => (
                              ph.url ? (
                                <img key={idx} src={ph.url} alt={ph.fileName || 'photo'} className="aspect-square w-full h-full object-cover rounded-md bg-slate-100" />
                              ) : (
                                <div key={idx} className="aspect-square rounded-md bg-slate-100" />
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>

                  {/* Video */}
                  <li>
                    <button type="button" aria-expanded={expandedSections.videos} onClick={() => toggleSection('videos')} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1">
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* Video icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M15 10l4-2v8l-4-2" />
                          <rect x="3" y="6" width="12" height="12" rx="2" />
                        </svg>
                        <span className="text-base">{latestVideos.length} videos</span>
                      </span>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.videos ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.videos && (
                      <div className="pb-1 max-h-64 overflow-auto pr-1">
                        {latestVideos.length === 0 ? (
                          <div className="text-base text-slate-500">No videos</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {latestVideos.map((v, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 10l4-2v8l-4-2"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
                                <span className="text-sm text-slate-800 truncate max-w-[220px]">{v.fileName || (v.mime || 'video')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>

                  {/* Audio */}
                  <li>
                    <button type="button" aria-expanded={expandedSections.audio} onClick={() => toggleSection('audio')} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1">
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* Audio icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                        <span className="text-base">{latestAudio.length} audio</span>
                      </span>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.audio ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.audio && (
                      <div className="pb-1 max-h-64 overflow-auto pr-1">
                        {latestAudio.length === 0 ? (
                          <div className="text-sm text-slate-500">No audio files</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {latestAudio.map((a, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                <span className="text-sm text-slate-800 truncate max-w-[220px]">{a.fileName || (a.mime || 'audio')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>

                  {/* Files */}
                  <li>
                    <button type="button" aria-expanded={expandedSections.files} onClick={() => toggleSection('files')} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1">
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* File icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span className="text-base">{latestFiles.length} files</span>
                      </span>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.files ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.files && (
                      <div className="pb-1 max-h-64 overflow-auto pr-1">
                        {latestFiles.length === 0 ? (
                          <div className="text-sm text-slate-500">No files</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {latestFiles.map((f, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                                <span className="text-sm text-slate-800 truncate max-w-[220px]">{f.fileName || (f.mime || 'file')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>

                  {/* Links */}
                  <li>
                    <button type="button" aria-expanded={expandedSections.links} onClick={() => toggleSection('links')} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1">
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* Link icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
                          <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
                        </svg>
                        <span className="text-base">{latestLinks.length} links</span>
                      </span>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.links ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.links && (
                      <div className="pb-1 max-h-64 overflow-auto pr-1">
                        {latestLinks.length === 0 ? (
                          <div className="text-sm text-slate-500">No links</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {latestLinks.map((l, idx) => (
                              <a key={idx} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-blue-700 hover:underline truncate">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"/><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"/></svg>
                                <span className="text-sm truncate max-w-[240px]">{l.url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>

                  {/* Voice message */}
                  <li>
                    <button type="button" aria-expanded={expandedSections.voice} onClick={() => toggleSection('voice')} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 rounded-md px-1">
                      <span className="flex items-center gap-2 text-slate-800">
                        {/* Mic icon */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="9" y="2" width="6" height="11" rx="3" />
                          <path d="M5 10a7 7 0 0 0 14 0" />
                          <path d="M12 19v3" />
                        </svg>
                        <span className="text-base">{latestVoice.length} voice messages</span>
                      </span>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${expandedSections.voice ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {expandedSections.voice && (
                      <div className="pb-1 max-h-64 overflow-auto pr-1">
                        {latestVoice.length === 0 ? (
                          <div className="text-sm text-slate-500">No voice messages</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {latestVoice.map((v, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/></svg>
                                <span className="text-sm text-slate-800 truncate max-w-[220px]">{v.fileName || 'Voice message'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                </ul>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Panel hidden</div>
            )}
          </div>

          {/* Bottom panel: Members list */}
          <div className="rounded-4xl bg-[#dbdcfe] overflow-hidden flex flex-col min-h-0 p-2.5">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <h3 className="text-3xl  font-semibold text-slate-800">Members {membersView.length}</h3>
              <button
                type="button"
                aria-label={membersOpen ? 'Close panel' : 'Open panel'}
                onClick={() => setMembersOpen(v => !v)}
                className="p-1 text-slate-500 hover:text-slate-700"
              >
                {membersOpen ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </button>
            </div>
            {membersOpen ? (
              <div className="flex-1 min-h-0 overflow-auto px-2 py-2">
                <div className="px-2 pb-2">
                  <input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Search members..."
                    className="w-full rounded-md bg-[#f9fafc] px-2 py-1 text-base outline-none"
                  />
                </div>
                {membersSorted.length === 0 ? (
                  <div className="text-sm text-slate-500 px-1 py-1">No members</div>
                ) : (
                  <ul className="space-y-1">
                    {membersSorted.map((m) => (
                      <li
                        key={m.userId}
                        className="relative flex items-center gap-3 px-2 py-2 rounded hover:bg-slate-50"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMemberMenuFor(m.userId);
                          setMemberMenuPos({ x: e.clientX, y: e.clientY });
                        }}
                      >
                        <img
                          src={m.avatar || `https://i.pravatar.cc/100?u=${encodeURIComponent(m.userId)}`}
                          alt={m.name || m.userId}
                          className="w-9 h-9 rounded-lg object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-slate-900 truncate">{m.name || m.userId}</div>
                          <div className="text-sm text-slate-500 truncate">{m.status}</div>
                        </div>
                        {m.role === 'vice' ? (
                          <span className="text-xs font-medium text-slate-700">Vice</span>
                        ) : (m.role === 'owner' || m.role === 'admin') ? (
                          <span className="text-xs font-medium text-slate-700">Admin</span>
                        ) : null}
                        {memberMenuFor === m.userId ? (
                          <div
                            className="fixed z-50 w-44 rounded-md bg-white shadow-lg ring-1 ring-black/5"
                            style={{ left: `${memberMenuPos.x}px`, top: `${memberMenuPos.y}px` }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(myRole === 'admin' && !isDirectChat && String(m.userId) !== String(user?.id)) && (
                              <>
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                  onClick={(e) => { e.stopPropagation(); setMemberMenuFor(null); removeMemberFromRoom(m.userId); }}
                                >Remove from group</button>
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                  onClick={(e) => { e.stopPropagation(); setMemberMenuFor(null); makeAdmin(m.userId); }}
                                >Give admin rights</button>
                                {m.role === 'vice' ? (
                                  <button
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                    onClick={(e) => { e.stopPropagation(); setMemberMenuFor(null); removeVice(m.userId); }}
                                  >Remove vice</button>
                                ) : (
                                  <button
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                    onClick={(e) => { e.stopPropagation(); setMemberMenuFor(null); makeVice(m.userId); }}
                                  >Make vice</button>
                                )}
                              </>
                            )}
                            {String(m.userId) !== String(user?.id) && (
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                onClick={(e) => { e.stopPropagation(); setMemberMenuFor(null); sendDirectMessage(m.userId); }}
                              >Send message</button>
                            )}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Panel hidden</div>
            )}
          </div>
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
