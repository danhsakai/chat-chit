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

  const errorId = 'form-error';
  const userErrId = 'username-error';
  const passErrId = 'password-error';
  const hasError = Boolean(error);

  const handleGoogle = () => {
    window.location.href = `${API}/api/auth/oauth/google`;
  };
  const handleGithub = () => {
    window.location.href = `${API}/api/auth/oauth/github`;
  };

  const inputBase =
    'w-full rounded-xl border bg-white border-slate-300 text-text-900 placeholder:text-slate-400 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/30';
  const inputError = 'border-red-500 focus:ring-red-300';

  return (
    <div className="min-h-screen bg-surface text-text-900 flex">
      {/* Left: cover image */}
      <aside className="relative hidden md:flex flex-1 items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=2000&auto=format&fit=crop"
            alt="People chatting in a cafe"
            className="w-full h-full object-cover brightness-90 saturate-105"
          />
        </div>
        <div className="relative z-10 w-full p-12 text-white bg-gradient-to-b from-transparent via-black/40 to-black/70">
          <h1 className="font-extrabold tracking-tight text-4xl md:text-5xl">Chát Chít</h1>
          <p className="text-white/90 text-sm md:text-base">Kết nối tức thì. Trò chuyện an toàn.</p>
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex-1 min-h-screen flex items-center justify-center p-8">
        <div className="w-[min(460px,92vw)] rounded-2xl border border-slate-200 bg-white shadow-xl px-7 py-6 animate-[fade-in_0.35s_ease-out]">
          <h2 className="text-2xl font-extrabold mb-1">{tab === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2>
          <p className="mb-4 text-sm text-text-900">
            {tab === 'login' ? (
              <>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="text-primary-500 font-bold hover:underline px-0"
                  onClick={() => setTab('register')}
                >
                  Đăng ký ngay
                </button>
              </>
            ) : (
              <>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  className="text-primary-500 font-bold hover:underline px-0"
                  onClick={() => setTab('login')}
                >
                  Đăng nhập
                </button>
              </>
            )}
          </p>

          {/* Social login */}
          <div className="flex flex-col gap-2 mb-2">
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-800 font-bold hover:-translate-y-[1px] active:translate-y-0 transition shadow-sm"
            >
              
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 512 512"><path fill="#202022" d="M500 261.8C500 403.3 403.1 504 260 504C122.8 504 12 393.2 12 256S122.8 8 260 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C270.5 52.6 106.3 116.6 106.3 256c0 86.5 69.1 156.6 153.7 156.6c98.2 0 135-70.4 140.8-106.9H260v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4"></path></svg>
              Tiếp tục với Google
            </button>

            <button
              type="button"
              onClick={handleGithub}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-50 font-bold hover:-translate-y-[1px] active:translate-y-0 transition shadow"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 512 512"><path fill="#fff" d="M173.9 397.4c0 2-2.3 3.6-5.2 3.6c-3.3.3-5.6-1.3-5.6-3.6c0-2 2.3-3.6 5.2-3.6c3-.3 5.6 1.3 5.6 3.6m-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9c2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3m44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9c.3 2 2.9 3.3 5.9 2.6c2.9-.7 4.9-2.6 4.6-4.6c-.3-1.9-3-3.2-5.9-2.9M252.8 8C114.1 8 8 113.3 8 252c0 110.9 69.8 205.8 169.5 239.2c12.8 2.3 17.3-5.6 17.3-12.1c0-6.2-.3-40.4-.3-61.4c0 0-70 15-84.7-29.8c0 0-11.4-29.1-27.8-36.6c0 0-22.9-15.7 1.6-15.4c0 0 24.9 2 38.6 25.8c21.9 38.6 58.6 27.5 72.9 20.9c2.3-16 8.8-27.1 16-33.7c-55.9-6.2-112.3-14.3-112.3-110.5c0-27.5 7.6-41.3 23.6-58.9c-2.6-6.5-11.1-33.3 2.6-67.9c20.9-6.5 69 27 69 27c20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27c13.7 34.7 5.2 61.4 2.6 67.9c16 17.7 25.8 31.5 25.8 58.9c0 96.5-58.9 104.2-114.8 110.5c9.2 7.9 17 22.9 17 46.4c0 33.7-.3 75.4-.3 83.6c0 6.5 4.6 14.4 17.3 12.1C436.2 457.8 504 362.9 504 252C504 113.3 391.5 8 252.8 8M105.2 352.9c-1.3 1-1 3.3.7 5.2c1.6 1.6 3.9 2.3 5.2 1c1.3-1 1-3.3-.7-5.2c-1.6-1.6-3.9-2.3-5.2-1m-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9c1.6 1 3.6.7 4.3-.7c.7-1.3-.3-2.9-2.3-3.9c-2-.6-3.6-.3-4.3.7m32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2c2.3 2.3 5.2 2.6 6.5 1c1.3-1.3.7-4.3-1.3-6.2c-2.2-2.3-5.2-2.6-6.5-1m-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2c-1.4-2.3-4-3.3-5.6-2"></path></svg>
              Tiếp tục với GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 text-text-900 text-xs my-2">
            <hr className="flex-1 border-slate-200" />
            <span className="color-appbg-950">hoặc</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          {/* Form */}
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 mt-1" aria-describedby={error ? errorId : undefined}>
            <div className="flex flex-col gap-2">
              <label htmlFor="username" className="text-sm font-bold text-accent-500">
                Tên đăng nhập
              </label>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập"
                required
                aria-required="true"
                aria-invalid={hasError ? 'true' : 'false'}
                aria-errormessage={hasError ? userErrId : undefined}
                className={`${inputBase} ${hasError ? inputError : ''}`}
              />
              {hasError && <p id={userErrId} className="text-xs text-red-600" aria-live="polite"></p>}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-bold text-accent-500">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                aria-required="true"
                aria-invalid={hasError ? 'true' : 'false'}
                aria-errormessage={hasError ? passErrId : undefined}
                className={`${inputBase} ${hasError ? inputError : ''}`}
              />
              {hasError && <p id={passErrId} className="text-xs text-red-600" aria-live="polite"></p>}
            </div>

            <div id={errorId} className="min-h-5 text-sm text-red-600" aria-live="polite">
              {error ? error : null}
            </div>

            <button
              type="submit"
              className="text-base mt-1 w-full rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-white font-extrabold px-4 py-3 shadow-lg shadow-primary-glow transition hover:saturate-110 hover:-translate-y-[1px] active:translate-y-0"
            >
              {tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
