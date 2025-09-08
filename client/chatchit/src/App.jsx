// client/src/App.jsx
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRooms, setCurrentRoom, setAuth, logout } from './store';
import ChatRoom from './components/ChatRoom';
import Login from './components/Login';

const API = 'http://localhost:4000';

export default function App() {
  const dispatch = useDispatch();
  const rooms = useSelector(s => s.rooms.list);
  const current = useSelector(s => s.rooms.current);
  const user = useSelector(s => s.auth.user);

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
          if (!current) dispatch(setCurrentRoom(list[0].id));
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
          dispatch(setCurrentRoom(id || list2[0]?.id));
        }
      } catch (e) {
        console.error('Load rooms failed:', e);
      }
    })();
  }, [dispatch, user]);

  // Sau khi gọi hook, mới kiểm tra user để return giao diện
  if (!user) return <Login />;

  // Fallback khi rooms rỗng: chỉ hiển thị nút tạo nhanh
  const safeRooms = rooms?.length ? rooms : [];

  return (
    <div style={{display:'grid', gridTemplateColumns:'240px 1fr', height:'100vh', background:'#f7f8fa'}}>
      <aside style={{
        borderRight:'1px solid #eee',
        padding:20,
        background:'#fff',
        boxShadow:'2px 0 8px rgba(0,0,0,0.03)',
        display:'flex',
        flexDirection:'column',
        gap:12
      }}>
        <h3 style={{marginBottom:16, fontWeight:600, fontSize:20, color:'#333'}}>Phòng</h3>
        <ul style={{listStyle:'none', padding:0, margin:0, flex:1}}>
          {safeRooms.map(r=>(
            <li key={r.id}>
              <button
                onClick={()=>dispatch(setCurrentRoom(r.id))}
                style={{
                  width:'100%', textAlign:'left', padding:'10px 14px',
                  background: current===r.id?'#e6f0ff':'transparent',
                  border:'none', borderRadius:6,
                  color:'#222', fontWeight:500,
                  cursor:'pointer',
                  transition:'background 0.2s',
                  marginBottom:4
                }}
                onMouseOver={e=>e.currentTarget.style.background='#f0f4fa'}
                onMouseOut={e=>e.currentTarget.style.background=current===r.id?'#e6f0ff':'transparent'}
              >
                #{r.name || r.id}
              </button>
            </li>
          ))}
        </ul>
        <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:8}}>
          <span style={{color:'#555', fontSize:15}}>Xin chào, <b>{user?.name || user?.id}</b></span>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              dispatch(logout());
            }}
            style={{padding:'10px 14px', borderRadius:6, border:'none', background:'#f44336', color:'#fff', fontWeight:600, cursor:'pointer'}}
          >Đăng xuất</button>
        </div>
      </aside>
      <main style={{background:'#f7f8fa'}}><ChatRoom /></main>
    </div>
  );
}
