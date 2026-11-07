# Câu Cá Online — Game tương tác TikTok LIVE

*Spec thiết kế · 2026-11-07*

## 1. Mục tiêu

Một game câu cá pixel art chạy trên web, được quay bằng TikTok LIVE Studio hoặc OBS rồi phát lên TikTok LIVE. Người xem tương tác trong app TikTok (vào phòng, thả tim, comment, follow, share, tặng quà) và thấy nhân vật của mình câu cá trên màn hình.

- **Giai đoạn đầu:** giữ chân người xem, kéo follow.
- **Giai đoạn sau:** tối ưu quà. Cơ chế quà có sẵn từ đầu nhưng cân nhẹ.

**Tiêu chí thành công:** chạy ổn định suốt một phiên live 2–3 tiếng, vài chục người chơi cùng lúc, không giật, không sập. Tắt và mở lại không mất dữ liệu người chơi.

**Phạm vi:** một kênh TikTok, chạy trên một máy tính, giao diện tiếng Việt. Không có đăng nhập, không lưu online.

## 2. Kiến trúc

```
TikTok LIVE ──▶ [Bộ nghe TikTok] ─┐
Bảng điều khiển ─▶ [Sự kiện giả] ─┤
                                  ▼
                       [Bộ dịch sự kiện] → sự kiện chuẩn
                                  ▼
                       [Bộ máy game] ⇄ [Kho dữ liệu JSON]
                                  ▼ WebSocket (trạng thái + sự kiện hiển thị)
                       [Trang game canvas 9:16]   [Bảng điều khiển]
```

Công nghệ: Node.js (v24 có sẵn trên máy), `tiktok-live-connector`, `ws`, HTTP tĩnh. Trang game dùng Canvas 2D thuần, không dùng game engine.

### Các khối

| Khối | Nhiệm vụ | Phụ thuộc |
|---|---|---|
| `server/tiktok/` Bộ nghe TikTok | Kết nối theo `@username`, phát sự kiện thô, tự kết nối lại (5s → 10s → 30s, sau đó cứ 30s), báo trạng thái kết nối | `tiktok-live-connector` |
| `server/events/` Bộ dịch sự kiện | Đổi sự kiện TikTok hoặc sự kiện giả thành dạng chuẩn `{type, user:{id,name,avatar}, ...}`. Các loại: `join`, `like{count}`, `chat{text}`, `follow`, `share`, `gift{coins,count,name}` | không |
| `server/game/` Bộ máy game | Toàn bộ luật chơi. Hàm thuần nhận `(state, event, now, rng)` và trả về state mới cùng danh sách sự kiện hiển thị. Có `tick(now)` cho phần chạy theo thời gian. **Server là nơi duy nhất quyết định kết quả.** | config, rng |
| `server/store/` Kho dữ liệu | Đọc và ghi `data/players.json`. Lưu mỗi 5s nếu có thay đổi và khi tắt server. Ghi ra file tạm rồi đổi tên để không hỏng file. | fs |
| `server/config/` Bộ đọc config | Đọc và kiểm tra `config/game.config.json`. Sai thì báo lỗi kèm đường dẫn trường, rồi dừng. | không |
| `server/index.js` | Nối các khối lại: HTTP tĩnh, WebSocket, gom sự kiện 200ms, vòng tick | tất cả |
| `public/game/` Trang game | Nhận trạng thái và vẽ. Tải lại trang thì lấy lại toàn bộ trạng thái. Không chứa luật chơi. | WebSocket |
| `public/admin/` Bảng điều khiển | Kết nối hoặc ngắt kênh, xem trạng thái, giả lập sự kiện, nút "Bão sự kiện", kick người chơi | WebSocket |

Bộ máy game nhận `rng` và `now` từ bên ngoài, nên test được với kết quả cố định.

## 3. Luật chơi

Mọi con số trong mục này là **giá trị mặc định** trong `config/game.config.json`.

### 3.1 Bến câu
- 12 chỗ, chia 2 hàng mỗi hàng 6 chỗ.
- `join` → nếu còn chỗ trống thì ngồi vào, không thì vào hàng chờ. Người đang ngồi rồi thì bỏ qua.
- Người chơi chưa có trên bến mà gửi `like`, `chat`, `gift`, `follow` hay `share` thì được tính như `join`. Lý do: TikTok không phải lúc nào cũng gửi sự kiện `join`.
- Người trong hàng chờ có tương tác thì được đưa lên đầu hàng chờ.
- Không tương tác trong `idleKickSeconds` = 300 giây thì rời bến, người đầu hàng chờ vào thay.
- Hàng chờ tối đa 50 người. Người chờ không tương tác 300 giây thì bị bỏ khỏi hàng.

### 3.2 Vòng câu
Các trạng thái: `idle → casting → waiting → bite → reeling → result → idle`.
- `casting` 1 giây. `waiting` ngẫu nhiên 25–40 giây. `bite` có cửa sổ 4 giây. `reeling` 1.5 giây. `result` 3 giây.
- Ở `idle` thì sau 2 giây tự quăng cần.
- **Thả tim:** mỗi tim trừ 0.3 giây thời gian chờ còn lại. Tổng thời gian chờ không xuống dưới 50% giá trị ban đầu.
- **Gõ `câu`** (không phân biệt hoa thường, có dấu hay không đều nhận): nếu đang `idle` thì quăng ngay.
- **Gõ `kéo`** trong lúc `bite`: cân nặng cá ×1.2.
- Hết cửa sổ `bite` thì vẫn kéo cá lên bình thường, không bị sổng. Lý do: giữ cho người chơi thụ động vẫn vui.

### 3.3 Bảng cá
5 bậc: `trash` 15%, `common` 55%, `rare` 22%, `epic` 7%, `legendary` 1%.
- `legendary` **chỉ** rơi khi người chơi đang có cờ "cơ hội Huyền thoại" từ quà 100+ xu. Khi không có cờ, 1% đó dồn vào `common`.
- Mỗi con cá trong config gồm: `id`, `name`, `tier`, `weightKg: [min, max]`, `sprite`. Bậc rác thì không có cân nặng, cho điểm cố định.
- Danh sách mặc định:
  - **Rác:** dép tổ ong, nón bảo hiểm, sổ nợ, thư tình người yêu cũ, lon nước ngọt
  - **Thường:** cá rô, cá trê, cá lóc, cá chép, cá rô phi
  - **Hiếm:** cá tra khổng lồ, cá chình, tôm càng xanh
  - **Quý hiếm:** cá koi, cá hô, rùa vàng
  - **Huyền thoại:** cá rồng, cá chép hóa rồng
- Chọn cá: chọn bậc theo tỉ lệ, sau đó chọn ngẫu nhiên đều một con trong bậc đó. Cân nặng ngẫu nhiên đều trong khoảng, làm tròn 0.1 kg.

### 3.4 Kinh nghiệm và cấp độ
- Điểm kinh nghiệm = số kg × 10, làm tròn. Rác cho 1 điểm.
- Điểm cần để lên cấp n+1 = `round(50 × n^1.5)`. Cấp tối đa 50.
- Danh hiệu theo khoảng cấp (config): 1–4 *Tập sự*, 5–9 *Cần thủ làng*, 10–19 *Sát thủ ao làng*, 20–34 *Cao thủ sông nước*, 35–49 *Đại sư biển cả*, 50 *Thần câu*.
- Màu cần câu đổi theo danh hiệu. Từ cấp 20 có hào quang.
- Người đã có dữ liệu cũ mà quay lại thì hiện thông báo *"Chào mừng {danh hiệu} cấp {n} @{tên} quay lại!"*.

### 3.5 Follow, share, quà
- **Follow:** +5 lượt "mồi thơm", kèm thông báo cảm ơn. Mỗi người chỉ được tính một lần trong một phiên.
- **Share:** +3 lượt mồi thơm, mỗi người tối đa 3 lần trong một phiên.
- **Mồi thơm:** mỗi lượt tiêu cho 1 vòng câu. Trong vòng đó, tỉ lệ `rare` và `epic` nhân 2, phần tăng thêm lấy bớt từ `common`.
- **Quà** được tính theo tổng xu = `coins × count`:
  - 1–9 xu: quăng cần ngay (nếu đang `idle`) và 60 giây "câu nhanh", thời gian chờ ×0.5. Tặng thêm khi còn hiệu lực thì cộng dồn thời gian, tối đa 300 giây.
  - 10–99 xu: +10 lượt mồi thơm và pháo hoa nhỏ
  - 100+ xu: bật cờ "cơ hội Huyền thoại" cho vòng tới, pháo hoa to, cả bến reo hò
- Các mốc xu và phần thưởng đều nằm trong config.

### 3.6 Bảng xếp hạng
- Top 5 trong phiên, xếp theo tổng kg câu được trong phiên.
- Con cá nặng nhất hôm nay, tính theo ngày trên máy, lưu trong `players.json`.
- Hai bảng luân phiên mỗi 10 giây.

### 3.7 Dữ liệu người chơi (`data/players.json`)
```json
{ "version": 1,
  "players": { "<tiktokUserId>": {
      "name": "...", "avatar": "url", "xp": 0, "level": 1,
      "totalKg": 0, "catches": 0,
      "collection": { "<fishId>": { "count": 0, "bestKg": 0 } },
      "firstSeen": "ISO", "lastSeen": "ISO" } },
  "records": { "<YYYY-MM-DD>": { "userId": "...", "fishId": "...", "kg": 0 } } }
```
Dữ liệu trong phiên (chỗ ngồi, mồi, cờ, kg trong phiên) chỉ nằm trong bộ nhớ, không lưu.

## 4. Giao diện

### 4.1 Trang game — 1080×1920
Từ trên xuống:
1. **Vùng an toàn trên**, mặc định 160px, trống vì TikTok phủ tên kênh ở đây.
2. Bảng xếp hạng (luân phiên) và đồng hồ.
3. Cảnh: trời đổi theo giờ thật (sáng 6–17h, chiều 17–19h, đêm còn lại, có trăng và đom đóm), cây, núi, hồ nước gợn sóng, bóng cá bơi, phao nhấp nhô.
4. Hai hàng bến gỗ, mỗi hàng 6 nhân vật. Trên đầu nhân vật có avatar tròn, tên (tối đa 12 ký tự), cấp. Trạng thái câu được thể hiện bằng animation, và dấu `!` lúc `bite`.
5. Popup kết quả: hiện 3 giây, bậc càng cao thì popup càng to và càng nổi. Tối đa 2 popup cùng lúc, còn lại xếp hàng.
6. Dòng tin: 3 tin gần nhất (vào bến, lên cấp, follow, quà).
7. Hướng dẫn luân phiên: `Gõ "câu" để quăng cần`, `Thả tim câu nhanh hơn`, `Follow nhận mồi thơm`. Kèm số người đang chờ.
8. **Vùng an toàn dưới**, mặc định 260px, trống vì ô comment và nút quà của TikTok.

- Canvas cố định 1080×1920 và tự co cho vừa cửa sổ trình duyệt. Pixel art vẽ ở độ phân giải thấp (270×480) rồi phóng ×4, giữ pixel sắc nét.
- Chữ: font pixel có hỗ trợ dấu tiếng Việt cho tiêu đề và popup, Be Vietnam Pro cho chữ nhỏ. Tất cả có viền đen. Font tải từ Google Fonts, có font dự phòng.
- Avatar không tải được thì dùng nhân vật mặc định, màu lấy theo mã băm của tên.

### 4.2 Lớp hình ảnh thay được
Mọi hình vẽ đều đi qua một **bản đồ sprite** (`public/game/sprites/`). Mỗi sprite có một id (`fish.ca_loc`, `char.body`, `scene.dock`...). Mặc định là hàm vẽ bằng code. Nếu trong `public/game/assets/` có file PNG trùng id (khai báo trong config, mục `assets`) thì dùng ảnh PNG thay cho hàm vẽ. Thay hình không cần sửa code.

### 4.3 Bảng điều khiển (`/admin`)
- Ô nhập `@username` cùng nút Kết nối và Ngắt. Đèn trạng thái: xanh = đã kết nối, vàng = đang thử lại hoặc kênh chưa live, đỏ = lỗi.
- Chỉ số: số người trên bến, số người chờ, sự kiện mỗi phút.
- Nút giả lập: +1 người, +20 người, mưa tim (500 tim), quà 1/50/500 xu, follow, share, comment "câu" hoặc "kéo" từ một người ngẫu nhiên trên bến.
- **Bão sự kiện:** 60 giây với 50 người và khoảng 3000 tim một phút, kèm comment và quà ngẫu nhiên.
- Danh sách người trên bến, mỗi người có nút kick.

## 5. Xử lý lỗi

- **Mất kết nối TikTok:** game tiếp tục chạy, admin hiện cảnh báo, trang game không hiện lỗi gì. Thử kết nối lại theo lịch ở mục 2.
- **Kênh chưa live:** trạng thái vàng, cứ 30 giây thử lại.
- **Trang game hoặc admin mất WebSocket:** tự kết nối lại sau 1–5 giây, nhận lại ảnh chụp trạng thái đầy đủ.
- **Sự kiện dồn dập:** server gom sự kiện mỗi 200ms. Tim được cộng dồn theo người. Mỗi lần đẩy sang trang game có giới hạn số sự kiện hiển thị.
- **Tên người xem:** bỏ ký tự điều khiển, cắt còn 12 ký tự hiển thị. Avatar chỉ nhận URL `https`.
- **Config sai:** dừng khởi động, in lỗi kèm đường dẫn trường, ví dụ `fish[3].weightKg: min > max`. Kiểm tra: tổng tỉ lệ các bậc = 100, mỗi bậc có ít nhất một con cá, khoảng giá trị hợp lệ, id không trùng.
- **`players.json` hỏng:** đổi tên file hỏng thành `players.corrupt-<thời gian>.json`, bắt đầu với dữ liệu trống, ghi cảnh báo vào log.

## 6. Kiểm thử

- Dùng `node --test`, không cần cài thư viện test. Làm theo TDD cho bộ máy game, kho dữ liệu, bộ đọc config, bộ dịch sự kiện.
- **Bộ máy game:** ngồi vào bến, hàng chờ, rời bến khi im lặng, ưu tiên người chờ có tương tác, vòng câu, tim rút ngắn thời gian chờ (có giới hạn), `câu`/`kéo`, chọn bậc theo tỉ lệ (kiểm bằng rng cố định), `legendary` chỉ ra khi có cờ, mồi thơm, mốc quà, điểm và cấp, danh hiệu, xếp hạng.
- **Kho dữ liệu:** ghi rồi đọc lại khớp, ghi an toàn, xử lý file hỏng.
- **Config:** file mặc định hợp lệ, từng loại lỗi đều bị bắt.
- **Kiểm tra thủ công:** chạy server, mở trang game ở khung 1080×1920, dùng admin giả lập và chạy Bão sự kiện, chụp màn hình kiểm tra bố cục, vùng an toàn, chữ tiếng Việt.

## 7. Cấu trúc thư mục

```
cauca/
├── config/game.config.json
├── data/                      (tự tạo, không đưa vào git)
├── server/{index.js, tiktok/, events/, game/, store/, config/}
├── public/game/{index.html, main.js, render/, sprites/, assets/}
├── public/admin/{index.html, admin.js}
├── tests/
├── package.json
└── README.md                  (tiếng Việt: cài đặt, chạy, gắn OBS/LIVE Studio, chỉnh config)
```

Chạy bằng `npm start`. Server mặc định ở `http://localhost:3000`, trang game ở `/game`, bảng điều khiển ở `/admin`.

## 8. Ngoài phạm vi (để sau)

Lưu online và trang cá nhân cho người xem. Nhiều kênh cùng lúc. Âm thanh (có thể thêm sau). Hình ảnh PNG chính thức. Tự đăng thống kê lên mạng.

## 9. Rủi ro

- `tiktok-live-connector` là thư viện không chính thức. Khi TikTok thay đổi, nó có thể lỗi tạm thời. Bộ nghe được tách riêng, nên có thể thay thư viện khác mà không đụng tới game.
- Phát bằng LIVE Studio hoặc OBS cần tài khoản đủ điều kiện. Việc này người dùng tự lo.
