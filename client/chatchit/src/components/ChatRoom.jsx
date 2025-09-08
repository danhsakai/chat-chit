// client/src/components/ChatRoom.jsx
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setHistory, addMessage } from '../store';
import { socket } from '../socket';

export default function ChatRoom() {
  const dispatch = useDispatch();
  const roomId = useSelector(s => s.rooms.current);
  const messages = useSelector(s => s.messages.byRoom[roomId] || []);
  const [text, setText] = useState('');
  const user = useSelector(s => s.auth.user);

  useEffect(() => {
    if (!roomId) return;
    socket.emit('joinRoom', { roomId });

    // tải lịch sử 50 tin gần nhất
    fetch(`http://localhost:4000/api/messages/${roomId}`)
      .then(r => r.json())
      .then(msgs => dispatch(setHistory({ roomId, messages: msgs })));
  }, [roomId, dispatch]);

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
      const res = await fetch(`http://localhost:4000/api/messages`, {
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
    } catch (e) {
      console.error(e);
    }
  };

  if (!roomId) return <div>Chọn phòng để bắt đầu</div>;

  return (
    <div style={{display:'grid', gridTemplateRows:'1fr auto', height:'100vh', background:'#f7f8fa'}}>
      <div style={{overflow:'auto', padding:24, background:'#fff', boxShadow:'0 2px 8px rgba(0,0,0,0.03)'}}>
        {messages.map(m => (
          <div key={m.id || `${m.roomId}-${m.createdAt}-${m.userId}`}
            style={{
              marginBottom:12,
              display:'flex',
              alignItems:'flex-end',
              gap:8
            }}>
            <div style={{
              background:'#e6f0ff',
              borderRadius:'16px',
              padding:'8px 16px',
              maxWidth:'70%',
              boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
              fontSize:15
            }}>
              <b style={{color:'#1976d2'}}>{m.userId}:</b> {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{display:'flex', gap:8, padding:20, borderTop:'1px solid #eee', background:'#fff'}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }} style={{
          flex:1,
          padding:'10px 14px',
          border:'1px solid #ddd',
          borderRadius:8,
          fontSize:15,
          outline:'none',
          boxShadow:'0 1px 4px rgba(0,0,0,0.03)'
        }} placeholder="Nhập tin nhắn..." />
        <button onClick={send} style={{
          padding:'10px 20px',
          background:'#1976d2',
          color:'#fff',
          border:'none',
          borderRadius:8,
          fontWeight:600,
          fontSize:15,
          cursor:'pointer',
          boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
          transition:'background 0.2s'
        }}>Gửi</button>
      </div>
    </div>
  );
}
