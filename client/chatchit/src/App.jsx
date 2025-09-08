// client/src/App.jsx
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRooms, setCurrentRoom } from './store';
import ChatRoom from './components/ChatRoom';
import Login from './components/Login';

const API = 'http://localhost:4000';

export default function App() {
  const dispatch = useDispatch();
  const rooms = useSelector(s => s.rooms.list);
  const current = useSelector(s => s.rooms.current);
  const user = useSelector(s => s.auth.user);

  // Nếu chưa đăng nhập thì hiển thị Login
  if (!user) return <Login />;

  useEffect(() => {
    (async () => {
      try {
        // 1) Lấy danh sách phòng
        const res = await fetch(`${API}/api/rooms`);
        const list = await res.json();

        if (Array.isArray(list) && list.length) {
          dispatch(setRooms(list));
          // 2) Nếu chưa chọn phòng, tự chọn phòng đầu tiên
          if (!current) dispatch(setCurrentRoom(list[0].id));
        } else {
          // 3) Nếu chưa có phòng nào, tạo "General" rồi tải lại
          const cr = await fetch(`${API}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'General' })
          });
          const { id } = await cr.json();
          const res2 = await fetch(`${API}/api/rooms`);
          const list2 = await res2.json();
          dispatch(setRooms(list2));
          dispatch(setCurrentRoom(id || list2[0]?.id));
        }
      } catch (e) {
        console.error('Load rooms failed:', e);
      }
    })();
  }, [dispatch]); // không phụ thuộc current để tránh vòng lặp

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
        {!safeRooms.length && <p style={{color:'#888'}}>Đang tạo phòng mặc định…</p>}
      </aside>
      <main style={{background:'#f7f8fa'}}><ChatRoom /></main>
    </div>
  );
}
