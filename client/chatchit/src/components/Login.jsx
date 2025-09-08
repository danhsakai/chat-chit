import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setAuth } from '../store';

const API = 'http://localhost:4000';

export default function Login() {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const dispatch = useDispatch();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/api/auth/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      localStorage.setItem('token', data.token);
      dispatch(setAuth({ user: data.user, token: data.token }));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f7f8fa'}}>
      <form onSubmit={submit} style={{minWidth:320, background:'#fff', padding:32, borderRadius:12, boxShadow:'0 2px 16px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', gap:16}}>
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <button type='button' onClick={()=>setTab('login')} style={{flex:1, padding:10, borderRadius:6, border:'none', background:tab==='login'?'#1976d2':'#eee', color:tab==='login'?'#fff':'#333', fontWeight:600, cursor:'pointer'}}>Đăng nhập</button>
          <button type='button' onClick={()=>setTab('register')} style={{flex:1, padding:10, borderRadius:6, border:'none', background:tab==='register'?'#1976d2':'#eee', color:tab==='register'?'#fff':'#333', fontWeight:600, cursor:'pointer'}}>Đăng ký</button>
        </div>
        <input value={username} onChange={e=>setUsername(e.target.value)} placeholder='Username' style={{padding:10, borderRadius:6, border:'1px solid #ddd', fontSize:16}} required />
        <input type='password' value={password} onChange={e=>setPassword(e.target.value)} placeholder='Password' style={{padding:10, borderRadius:6, border:'1px solid #ddd', fontSize:16}} required />
        {error && <div style={{color:'red', fontSize:14}}>{error}</div>}
        <button type='submit' style={{padding:12, borderRadius:6, border:'none', background:'#1976d2', color:'#fff', fontWeight:600, fontSize:16, cursor:'pointer'}}>Xác nhận</button>
      </form>
    </div>
  );
}
