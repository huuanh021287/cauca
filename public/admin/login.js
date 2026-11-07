// Gửi thông tin đăng nhập tới máy chủ; thành công thì chuyển sang trang admin.
// Mật khẩu chỉ đi qua một lần trong thân yêu cầu, không lưu ở trình duyệt.
const form = document.getElementById('loginForm');
const err = document.getElementById('err');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true;
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('user').value.trim(),
        password: document.getElementById('pass').value,
      }),
    });
    if (r.ok) { location.replace('/admin/'); return; }
    const body = await r.json().catch(() => ({}));
    err.textContent = body.message || 'Đăng nhập thất bại.';
    err.hidden = false;
  } catch {
    err.textContent = 'Không kết nối được tới máy chủ.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    document.getElementById('pass').value = '';
  }
});
