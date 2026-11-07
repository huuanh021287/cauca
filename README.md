# Câu Cá Online

Game câu cá dành cho phiên **TikTok LIVE**: khán giả vào phòng là có ghế ngồi câu, gõ chat `cau` / `keo`, thả tim, tặng quà để câu được cá hiếm, lên cấp và leo bảng xếp hạng. Bạn chỉ cần chạy chương trình trên máy, rồi đưa màn hình game vào OBS hoặc TikTok LIVE Studio.

## Yêu cầu

Cần cài **Node.js phiên bản 24 trở lên**. Tải tại [https://nodejs.org](https://nodejs.org). Kiểm tra bằng lệnh sau trong Terminal (hoặc Command Prompt):

```bash
node -v
```

Kết quả phải là `v24.x.x` trở lên. Nếu thấp hơn hoặc báo không tìm thấy lệnh, hãy cài lại Node.js.

## Cài đặt

Mở Terminal tại thư mục dự án (thư mục có file `package.json`) rồi chạy lệnh sau, chỉ cần làm một lần:

```bash
npm install
```

## Chạy

```bash
npm start
```

Khi thấy dòng `Câu Cá chạy tại http://localhost:3000`, mở trình duyệt vào trang điều khiển (admin):

```
http://localhost:3000/admin
```

Muốn tắt game, bấm `Ctrl+C` trong Terminal. Dữ liệu người chơi được lưu tự động (xem phần "Dữ liệu người chơi").

## Kết nối TikTok

1. Bắt đầu phiên LIVE trên TikTok **trước**.
2. Vào trang admin, nhập `@tên_tài_khoản` của bạn vào ô và bấm **Kết nối**. Bấm **Ngắt** để dừng nghe.

Đèn trạng thái ở trang admin có ý nghĩa như sau:

| Đèn | Thông báo | Ý nghĩa |
|---|---|---|
| Xám | Chưa kết nối / Đã ngắt kết nối | Chưa nghe TikTok. |
| Vàng | Đang kết nối tới @... | Đang thử kết nối. |
| Xanh lá | Đã kết nối tới @... | Hoạt động bình thường, sự kiện từ phòng live đang đổ về. |
| Vàng | Kênh chưa live, thử lại sau 30 giây | Tài khoản chưa bấm LIVE. Cứ bật LIVE, game tự thử lại. |
| Vàng | Mất kết nối, thử lại sau N giây | Mạng hoặc TikTok chập chờn. Game tự thử lại (5 giây, 10 giây, rồi 30 giây một lần). |
| Đỏ | Tên kênh TikTok không hợp lệ / Tên người dùng TikTok không hợp lệ | Gõ sai tên. Sửa lại rồi bấm Kết nối. |

Ngoài đèn, trang admin còn hiện số người trên bến, số người đang chờ và số sự kiện mỗi phút.

## Thử không cần live

Trang admin có mục **Giả lập sự kiện** để thử game khi chưa lên sóng:

- **+1 người**, **+20 người**: thêm khán giả giả vào phòng.
- **Mưa tim**: một loạt lượt thả tim.
- **Quà 1 xu**, **Quà 50 xu**, **Quà 500 xu**: tặng quà giả ở ba mức.
- **Follow**, **Share**: giả lập theo dõi và chia sẻ.
- **Gõ "câu"**, **Gõ "kéo"**: giả lập chat thả cần và kéo cần.
- **Bão sự kiện**: trong 60 giây, 50 người giả liên tục thả tim, chat, tặng quà để thử game chịu tải. Bấm lại (nút đổi thành **Dừng**) để tắt sớm.

Mở `http://localhost:3000/game` trong trình duyệt để xem game phản ứng.

## Gắn vào OBS

1. Trong OBS, thêm nguồn mới: **Browser** (Browser Source).
2. URL: `http://localhost:3000/game`
3. Width **1080**, Height **1920**.
4. FPS: **30**.
5. Tùy chọn: tick **Refresh browser when scene becomes active** nếu muốn game tải lại mỗi lần chuyển cảnh.
6. Canvas của OBS cũng nên đặt dọc 1080×1920 (Settings, Video).

Phải chạy `npm start` trước, nếu không nguồn sẽ trống hoặc báo lỗi.

## Gắn vào TikTok LIVE Studio

1. Trong LIVE Studio, thêm nguồn **Link** (hoặc **Browser**, tùy phiên bản).
2. Nhập cùng URL: `http://localhost:3000/game`
3. Đặt canvas dọc (9:16) rồi kéo khung game phủ đầy canvas. Game đã chừa sẵn vùng trống ở trên và dưới cho giao diện TikTok.

## Chỉnh config

Mọi con số của game nằm trong file `config/game.config.json`. Mở bằng Notepad hoặc VS Code, sửa, lưu, rồi **tắt và chạy lại** `npm start` để áp dụng. Các dòng `_ghiChu` chỉ là ghi chú, không ảnh hưởng game.

| Nhóm | Ý nghĩa |
|---|---|
| `dock` | Bến câu: số ghế (`seats`), số hàng (`rows`), sau bao nhiêu giây không hoạt động thì bị mời khỏi ghế (`idleKickSeconds`), độ dài hàng chờ (`queueMax`) và thời gian chờ tối đa (`queueIdleSeconds`). Màn hình game vẽ đúng 2 hàng × 6 ghế, nên `rows` phải là `2` và `seats` là số nguyên từ 1 tới 12 (ít hơn 12 thì các ghế cuối để trống). |
| `fishing` | Nhịp câu theo giây: tự thả cần (`autoCastDelaySec`), thả cần (`castSec`), chờ cá cắn (`waitSec`, dạng [ngắn nhất, dài nhất]), thời gian được giật cần (`biteWindowSec`), kéo cần (`reelSec`), hiện kết quả (`resultSec`). Mỗi lượt thả tim rút ngắn thời gian chờ `likeReduceSec` giây nhưng không quá `minWaitRatio` so với thời gian gốc. `reelBonusMultiplier` là hệ số thưởng khi kéo đúng lúc. |
| `commands` | Từ khóa chat để thả cần (`cast`) và kéo cần (`reel`). Viết thường, không dấu. Có thể thêm nhiều từ khóa vào danh sách, từ đầu tiên là từ mặc định của nút giả lập. |
| `tiers` | Tỉ lệ phần trăm ra từng bậc: `trash` (rác), `common`, `rare`, `epic`, `legendary`. |
| `fish` | Danh sách cá và vật phẩm (xem bên dưới). |
| `xp` | Kinh nghiệm: `perKg` điểm mỗi kg cá, `trashXp` điểm cho rác, cấp n cần `curveBase * n^curveExp` XP, cấp tối đa `maxLevel`. |
| `titles` | Danh hiệu và màu cần câu theo khoảng cấp (`from` đến `to`). |
| `auraFromLevel` | Từ cấp này trở lên nhân vật có hào quang. |
| `rewards` | Thưởng follow và share: số mồi (`bait`) và số lần tối đa mỗi phiên (`perSession`). `baitMultiplier` là hệ số mồi tăng khả năng ra cá rare/epic. |
| `gifts` | Hiệu ứng quà theo khoảng xu (`minCoins` đến `maxCoins`; `null` là không giới hạn). Khoảng phải xếp tăng dần và không chồng nhau. Hiệu ứng: `fast` (câu nhanh), `bait` (thêm mồi), `legendary` (chắc chắn ra cá huyền thoại). |
| `leaderboard` | Bảng xếp hạng: số người hiển thị (`sessionTop`) và chu kỳ đổi bảng (`rotateSec`). |
| `ui` | Giao diện: kích thước 1080×1920, vùng chừa trống trên/dưới (`safeTop`, `safeBottom`), số ký tự tên tối đa, số popup, số dòng thông báo. Bình thường không cần đổi. |
| `server` | Máy chủ: địa chỉ (`host`), cổng (`port`), nhịp cập nhật và tự lưu (`autosaveMs`). Xem phần "Bảo mật". |
| `assets` | Thay hình bằng PNG (xem phần dưới). |

### Thêm cá mới

Thêm một dòng vào mảng `fish`, ví dụ:

```json
{ "id": "ca_basa", "name": "Cá basa", "tier": "rare", "weightKg": [2, 9], "sprite": "fish.ca_basa" }
```

- `id`: tên không dấu, không trùng cá khác.
- `name`: tên hiển thị.
- `tier`: một trong `trash`, `common`, `rare`, `epic`, `legendary`.
- `weightKg`: [nhẹ nhất, nặng nhất] tính bằng kg. Với `trash` (rác) thì không cần, thay bằng `"xp": 1`.
- `sprite`: nên đặt `fish.` cộng với `id`. Chưa có hình riêng thì game vẽ hình cá mặc định. Muốn dùng hình riêng, xem phần thay hình PNG.

### Quy tắc bắt buộc

- Năm số trong `tiers` phải **cộng đúng 100**.
- Mỗi bậc (kể cả bậc để tỉ lệ 0) phải có **ít nhất 1 con cá** thuộc bậc đó.
- Sửa xong phải **tắt và chạy lại** server.

Nếu config sai, server từ chối chạy và in lỗi tiếng Việt, ví dụ:

```
Config không hợp lệ:
  - tiers: tổng phải bằng 100 (hiện là 95)
```

Đọc dòng lỗi để biết chỗ sai, sửa lại file rồi chạy lại. Nếu rối quá, lấy lại bản gốc bằng cách tải lại file `config/game.config.json` từ nơi bạn nhận dự án.

## Thay hình bằng PNG

Mặc định game tự vẽ mọi hình bằng code. Muốn dùng hình của bạn, bỏ file PNG vào thư mục `public/game/assets/` rồi khai báo trong nhóm `assets` của config. Đường dẫn tính **từ thư mục `public/game/`**:

```json
"assets": {
  "fish.ca_loc": "assets/ca_loc.png",
  "scene.moon": "assets/trang.png"
}
```

Sau đó khởi động lại server và tải lại trang game (OBS: bấm Refresh). Hình lỗi hoặc sai đường dẫn thì game giữ hình mặc định và ghi cảnh báo trong console của trình duyệt.

Các id có thể thay:

- Cá: `fish.generic` (cá mặc định cho mọi loại chưa có hình riêng) và `fish.<id>` cho từng cá trong config. Hiện có: `fish.dep_to_ong`, `fish.non_bao_hiem`, `fish.so_no`, `fish.thu_tinh`, `fish.lon_nuoc`, `fish.ca_ro`, `fish.ca_tre`, `fish.ca_loc`, `fish.ca_chep`, `fish.ca_ro_phi`, `fish.ca_tra`, `fish.ca_chinh`, `fish.tom_cang`, `fish.ca_koi`, `fish.ca_ho`, `fish.rua_vang`, `fish.ca_rong`, `fish.ca_chep_hoa_rong`. Cá bạn thêm mới dùng đúng id ghi ở `sprite`.
- Cảnh nền: `scene.mountain`, `scene.tree`, `scene.hut`, `scene.lotus`, `scene.cloud`, `scene.moon`, `scene.sun`, `scene.dock`, `scene.lantern`.
- Nhân vật và hiệu ứng: `char.body`, `char.rod`, `fx.bobber` (phao), `fx.splash` (bọt nước), `fx.exclaim` (dấu chấm than khi cá cắn), `fx.legendary` (rồng huyền thoại), `fx.bait` (mồi).

Lời khuyên về kích thước: game là pixel art vẽ ở độ phân giải thấp 270×480 rồi phóng to 4 lần lên 1080×1920. Vì vậy hãy làm PNG **nhỏ** (ví dụ cá khoảng 32×16 đến 48×24 pixel, nền trong suốt) và **không làm mờ**; ảnh được vẽ đúng kích thước gốc và phóng to bằng pixel vuông. Ảnh quá to sẽ che cả màn hình.

## Dữ liệu người chơi

Cấp độ, XP và bộ sưu tập cá của khán giả được lưu trong `data/players.json` (tự tạo khi chạy, lưu mỗi 5 giây và khi tắt bằng `Ctrl+C`). Lần live sau, khán giả quay lại sẽ được nhận ra và chào "quay lại".

- **Sao lưu**: tắt server rồi copy file `data/players.json` sang chỗ khác.
- **Reset toàn bộ**: tắt server, xóa file `data/players.json`, chạy lại.
- **Người chơi giả**: người chơi tạo bằng các nút thử ở trang admin (tên dạng "Đức Thắng 1", id bắt đầu bằng `sim_`) **không được lưu** vào `data/players.json` và không chiếm kỷ lục "Cá to nhất hôm nay" đã lưu. Họ chỉ tồn tại tới khi tắt server, nên bạn không cần xóa file dữ liệu trước buổi live thật. (File cũ có lẫn người giả sẽ tự được dọn ở lần lưu kế tiếp.)

## Xử lý sự cố

- **Kênh chưa live**: đèn vàng "Kênh chưa live, thử lại sau 30 giây". Bấm LIVE trên TikTok, game tự kết nối lại, không cần làm gì thêm.
- **Mất kết nối**: đèn vàng "Mất kết nối, thử lại sau N giây". Kiểm tra mạng, game sẽ tự thử lại. Nếu kéo dài, bấm **Ngắt** rồi **Kết nối** lại.
- **Tên kênh sai**: đèn đỏ. Nhập lại đúng `@tên_tài_khoản` (có hay không có dấu @ đều được) rồi bấm Kết nối.
- **Config sai**: server không chạy và in lỗi tiếng Việt như phần "Chỉnh config". Sửa theo dòng lỗi.
- **Cổng 3000 đang bận** (lỗi `EADDRINUSE`): có một bản game khác đang chạy. Tắt nó (`Ctrl+C` ở cửa sổ cũ) hoặc đổi `server.port` trong config rồi nhớ đổi URL tương ứng trong OBS.
- **Màn hình đen trong OBS**: kiểm tra `npm start` đang chạy; mở `http://localhost:3000/game` bằng trình duyệt thử; kiểm tra URL, Width 1080 và Height 1920; bấm **Refresh cache of current page** trên nguồn Browser.
- **Trang admin báo "Mất kết nối server"**: server đã tắt. Chạy lại `npm start`.

## Bảo mật

Mặc định server chỉ lắng nghe ở `127.0.0.1`, nghĩa là **chỉ máy của bạn** mở được trang admin và game. Bạn có thể đổi `server.host` trong config (ví dụ để xem từ máy khác), nhưng khi đó **bất kỳ ai trong cùng mạng LAN** cũng điều khiển được game (giả lập quà, đá người chơi...). Chỉ làm vậy khi mạng của bạn tin cậy được. Khi mở từ máy khác, hãy dùng **địa chỉ IP** của máy chạy game (ví dụ `http://192.168.x.x:3000/admin`), hoặc đúng tên đã đặt trong `server.host`. Mọi tên miền khác ngoài `localhost` đều bị từ chối có chủ đích (chống tấn công DNS rebinding: trang web lạ không thể mượn tên miền của nó để điều khiển game của bạn).

## Giấy phép và lưu ý

Game dùng thư viện `tiktok-live-connector` theo giấy phép **AGPL-3.0**. Đây là thư viện **không chính thức**, không do TikTok cung cấp. TikTok có thể thay đổi hệ thống bất cứ lúc nào khiến việc kết nối bị lỗi tạm thời cho đến khi thư viện được cập nhật. Hãy luôn thử trước giờ live và có sẵn phương án dự phòng.
