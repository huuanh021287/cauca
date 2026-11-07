# Câu Cá Online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Game câu cá pixel art chạy trên web (khung 1080×1920), nhận sự kiện TikTok LIVE và lưu tiến trình người chơi trên máy.

**Architecture:** Server Node.js giữ toàn bộ luật chơi. Sự kiện từ TikTok hoặc từ bảng điều khiển được chuẩn hóa thành một dạng chung rồi đưa vào bộ máy game. Server phát trạng thái và sự kiện hiển thị qua WebSocket. Trang game vẽ bằng Canvas 2D, không chứa luật chơi.

**Tech Stack:** Node.js 24 (ES modules), `tiktok-live-connector`, `ws`, `node:test`, HTML/Canvas thuần, Google Fonts (VT323, Be Vietnam Pro).

**Spec:** `docs/superpowers/specs/2026-11-07-cau-ca-tiktok-live-design.md`. Đọc spec trước khi làm bất kỳ task nào.

## Global Constraints

- Node ≥ 24, `"type": "module"`. Chỉ có 2 dependency chạy chính là `tiktok-live-connector` và `ws`. Không dùng framework web và không cần bước build.
- Test dùng `node --test tests/`. Không cài thư viện test.
- Mọi con số luật chơi lấy từ `config/game.config.json`. Không hard-code trong code.
- Mọi chữ hiển thị cho người xem bằng **tiếng Việt có dấu**.
- Canvas game 1080×1920. Pixel art vẽ ở 270×480 rồi phóng ×4 với `imageSmoothingEnabled = false`.
- Vùng an toàn: trên `ui.safeTop` = 160px, dưới `ui.safeBottom` = 260px. Không vẽ chữ hay UI quan trọng trong hai vùng này.
- Bộ máy game không được gọi `Date.now()` hay `Math.random()`. `now` (tính bằng ms) và `rng` phải được truyền vào.
- Server chạy ở `http://localhost:3000`. Trang game ở `/game`, bảng điều khiển ở `/admin`, WebSocket ở `/ws`.
- `data/` nằm trong `.gitignore`.

## Review Focus

1. **TikTok gửi `join` nhiều lần cho cùng một người** (khi họ vào lại phòng, khi kết nối lại) → không được tạo hai chỗ ngồi. Người đang ở hàng chờ cũng không bị thêm lần hai. *(Task 3)*
2. **Quà dạng combo** (`giftType === 1`, gửi nhiều sự kiện trong lúc `repeatEnd === false`) → chỉ tính một lần ở sự kiện có `repeatEnd`, với `count = repeatCount`. *(Task 6)*
3. **Người chơi bị kick hoặc rời bến khi đang `reeling`/`result`, sau đó gõ lệnh** → không crash, không bị ghi nhận cá. Nếu họ tương tác thì được ngồi lại như người mới. *(Task 4)*
4. **Qua nửa đêm khi đang live** → kỷ lục "cá to nhất hôm nay" chuyển sang ngày mới, không gộp với ngày cũ. *(Task 5)*
5. **Tên người xem toàn emoji hoặc ký tự điều khiển, sau khi lọc thành rỗng** → hiển thị tên `Cần thủ`, không vẽ chuỗi rỗng. *(Task 6)*

---

## Hợp đồng chung (dùng trong nhiều task)

**Sự kiện chuẩn (StdEvent):**
```js
{ type: 'join'|'like'|'chat'|'follow'|'share'|'gift',
  user: { id: string, name: string, avatar: string|null },
  count?: number,   // like
  text?: string,    // chat
  coins?: number,   // gift: tổng xu = diamondCount × repeatCount
  giftName?: string }
```

**Sự kiện hiển thị (DisplayEvent):** `{ kind, userId, name, ...payload }`, với các `kind`:
`seat`, `leave`, `queued`, `welcome_back {level,title}`, `cast`, `bite`, `catch {fishId,fishName,tier,kg}`, `level_up {level,title}`, `follow_thanks {bait}`, `share_thanks {bait}`, `gift {effect,fireworks}`.

**Snapshot (gửi cho client):**
```js
{ serverNow, seats: Array<SeatView|null>, queueLength,
  leaderboard: { session: [{name, kg}], today: {name, fishName, kg}|null } }
// SeatView:
{ userId, name, avatar, level, title, rodColor, aura:boolean,
  phase: 'idle'|'casting'|'waiting'|'bite'|'reeling'|'result',
  phaseStartedAt, phaseEndsAt, bait, legendary:boolean, fastUntil, lastCatch: {fishId,fishName,tier,kg}|null }
```

**Giao thức WebSocket** (JSON, trường `t` là loại tin):
- Server → client: `{t:'snapshot', data}` khi vừa kết nối và mỗi 250ms. `{t:'events', data: DisplayEvent[]}` sau mỗi lần gom sự kiện. `{t:'status', data:{tiktok, message, seated, queued, eventsPerMin, players:[{userId,name,level}]}}` gửi cho admin mỗi 1s.
- Admin → server: `{t:'connect', username}`, `{t:'disconnect'}`, `{t:'sim', kind, ...}`, `{t:'storm'}`, `{t:'kick', userId}`.
- Giá trị `tiktok` có thể là `'offline'|'connecting'|'connected'|'retrying'|'not_live'|'error'`.

---

### Task 1: Khởi tạo dự án + file config + bộ kiểm tra config

**Files:**
- Create: `package.json`, `config/game.config.json`, `server/config/loadConfig.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `loadConfig(path?: string) -> Config` (mặc định đọc `config/game.config.json`, sai thì throw `ConfigError` có `.errors: string[]`). `validateConfig(obj) -> string[]` (rỗng nghĩa là hợp lệ). `class ConfigError extends Error`.

- [ ] **Step 1: Tạo `package.json`**
  `"type":"module"`. Scripts: `"start": "node server/index.js"`, `"test": "node --test tests/"`. `engines.node: ">=24"`. Cài `npm i ws tiktok-live-connector`.

- [ ] **Step 2: Tạo `config/game.config.json`** đúng cấu trúc dưới đây. Mỗi nhóm có một khóa `"_ghiChu"` giải thích bằng tiếng Việt. Bộ kiểm tra bỏ qua mọi khóa bắt đầu bằng `_`.
```json
{
  "dock":    { "seats": 12, "rows": 2, "idleKickSeconds": 300, "queueMax": 50, "queueIdleSeconds": 300 },
  "fishing": { "autoCastDelaySec": 2, "castSec": 1, "waitSec": [25, 40], "biteWindowSec": 4,
               "reelSec": 1.5, "resultSec": 3, "likeReduceSec": 0.3, "minWaitRatio": 0.5,
               "reelBonusMultiplier": 1.2 },
  "commands": { "cast": ["cau"], "reel": ["keo"] },
  "tiers": { "trash": 15, "common": 55, "rare": 22, "epic": 7, "legendary": 1 },
  "fish": [ /* danh sách bên dưới */ ],
  "xp": { "perKg": 10, "trashXp": 1, "curveBase": 50, "curveExp": 1.5, "maxLevel": 50 },
  "titles": [
    { "from": 1,  "to": 4,  "name": "Tập sự",            "rodColor": "#8b5a2b" },
    { "from": 5,  "to": 9,  "name": "Cần thủ làng",      "rodColor": "#4caf50" },
    { "from": 10, "to": 19, "name": "Sát thủ ao làng",   "rodColor": "#2196f3" },
    { "from": 20, "to": 34, "name": "Cao thủ sông nước", "rodColor": "#9c27b0" },
    { "from": 35, "to": 49, "name": "Đại sư biển cả",    "rodColor": "#ff9800" },
    { "from": 50, "to": 50, "name": "Thần câu",          "rodColor": "#ffd700" } ],
  "auraFromLevel": 20,
  "rewards": { "follow": { "bait": 5, "perSession": 1 }, "share": { "bait": 3, "perSession": 3 },
               "baitMultiplier": { "rare": 2, "epic": 2 } },
  "gifts": [
    { "minCoins": 1,   "maxCoins": 9,    "effect": "fast", "fastSec": 60, "fastMaxSec": 300, "waitMultiplier": 0.5 },
    { "minCoins": 10,  "maxCoins": 99,   "effect": "bait", "bait": 10, "fireworks": "small" },
    { "minCoins": 100, "maxCoins": null, "effect": "legendary", "fireworks": "big" } ],
  "leaderboard": { "sessionTop": 5, "rotateSec": 10 },
  "ui": { "width": 1080, "height": 1920, "safeTop": 160, "safeBottom": 260, "nameMaxChars": 12,
          "maxPopups": 2, "popupSec": 3, "feedLines": 3 },
  "server": { "port": 3000, "tickMs": 250, "batchMs": 200, "snapshotMs": 250, "autosaveMs": 5000,
              "maxDisplayEventsPerFlush": 30 },
  "assets": {}
}
```
  Danh sách cá. Rác có `xp` cố định, không có `weightKg`. `sprite` = `fish.<id>`.
  - trash: `dep_to_ong` Dép tổ ong, `non_bao_hiem` Nón bảo hiểm, `so_no` Sổ nợ, `thu_tinh` Thư tình người yêu cũ, `lon_nuoc` Lon nước ngọt (mỗi món `xp: 1`)
  - common: `ca_ro` Cá rô [0.1,0.5], `ca_tre` Cá trê [0.3,1.5], `ca_loc` Cá lóc [0.5,3], `ca_chep` Cá chép [0.5,4], `ca_ro_phi` Cá rô phi [0.2,1.2]
  - rare: `ca_tra` Cá tra khổng lồ [5,20], `ca_chinh` Cá chình [1,6], `tom_cang` Tôm càng xanh [0.1,0.4]
  - epic: `ca_koi` Cá koi [2,8], `ca_ho` Cá hô [20,80], `rua_vang` Rùa vàng [3,15]
  - legendary: `ca_rong` Cá rồng [10,30], `ca_chep_hoa_rong` Cá chép hóa rồng [30,100]

- [ ] **Step 3: Viết test (fail trước)** trong `tests/config.test.js`:
  - `default config is valid`: `validateConfig(JSON.parse(fs.readFileSync('config/game.config.json')))` trả về `[]`
  - `tiers must sum to 100`: đặt `tiers.common = 50` → lỗi có chứa `"tiers"`
  - `weightKg min > max rejected`: `fish[5].weightKg = [3,1]` → lỗi có chứa `"fish[5].weightKg"`
  - `duplicate fish id rejected`: lỗi có chứa `"trùng"`
  - `every tier needs a fish`: bỏ hết cá legendary → lỗi có chứa `"legendary"`
  - `underscore keys ignored`: thêm `"_ghiChu": "x"` vào nhóm `dock` → không có lỗi
  - `loadConfig throws ConfigError on bad JSON`: ghi file tạm có nội dung `{`, sau đó `assert.throws(..., ConfigError)`

- [ ] **Step 4: Chạy `npm test`** → FAIL vì chưa có module.

- [ ] **Step 5: Viết `validateConfig` và `loadConfig`.** Mỗi lỗi là một chuỗi tiếng Việt bắt đầu bằng đường dẫn trường, ví dụ `fish[5].weightKg: min > max`. Kiểm tra: kiểu số dương, `waitSec` và `weightKg` có min ≤ max, tổng `tiers` = 100, mỗi bậc có ít nhất một cá, id không trùng, `gifts` sắp tăng dần và các khoảng xu không chồng nhau, `titles` phủ kín từ 1 tới `xp.maxLevel`.

- [ ] **Step 6: Chạy `npm test`** → PASS.

- [ ] **Step 7: Commit** `feat: config mặc định và bộ kiểm tra config`

---

### Task 2: Ngẫu nhiên, chọn cá, kinh nghiệm và cấp độ

**Files:**
- Create: `server/game/rng.js`, `server/game/catch.js`, `server/game/progression.js`
- Test: `tests/catch.test.js`, `tests/progression.test.js`

**Interfaces:**
- Produces:
  - `createRng(seed: number) -> () => number` (mulberry32, kết quả trong [0,1))
  - `seqRng(values: number[]) -> () => number` (trả lần lượt các giá trị, chỉ dùng trong test, xuất ra từ `rng.js`)
  - `tierWeights(config, {bait: boolean, legendary: boolean}) -> Record<tier, number>`
  - `rollCatch(config, {bait, legendary, reelBonus: boolean}, rng) -> {fishId, fishName, tier, kg}` (rác thì `kg = 0`)
  - `xpForCatch(config, catchResult) -> number`
  - `xpToNext(config, level) -> number` = `round(curveBase × level^curveExp)`
  - `applyXp(config, player: {xp, level}, gained) -> number` (sửa trực tiếp `player`, trả về số cấp vừa lên. `xp` là điểm tích lũy trong cấp hiện tại, chạm `maxLevel` thì dừng)
  - `titleFor(config, level) -> {name, rodColor, aura: boolean}`

- [ ] **Step 1: Viết test (fail trước):**
  - `tierWeights without legendary moves 1% to common`: `{trash:15, common:56, rare:22, epic:7, legendary:0}`
  - `tierWeights with legendary`: giữ nguyên giá trị mặc định
  - `tierWeights with bait`: `rare 44, epic 14, common 27, legendary 0, trash 15`. Tổng vẫn là 100.
  - `rollCatch picks tier by cumulative weight`: `seqRng([0.10, 0, 0])` → trash. `seqRng([0.20, 0, 0])` → common. `seqRng([0.995, 0, 0])` khi `legendary:true` → legendary.
  - `rollCatch never yields legendary without flag`: dùng `createRng(1)` chạy 10.000 lần → không có legendary
  - `kg within range and rounded to 0.1`: `ca_loc` luôn nằm trong [0.5,3], và `kg*10` là số nguyên
  - `reelBonus multiplies kg by 1.2`: cùng chuỗi rng, kg có bonus = `round1(kg × 1.2)`
  - `xpForCatch`: Cá lóc 2.3kg → 23. Rác → 1.
  - `xpToNext(1) = 50`, `xpToNext(4) = 400`
  - `applyXp multi-level`: `{xp:0, level:1}` cộng 200 điểm. Lên cấp 2 tốn 50, lên cấp 3 tốn 141, còn dư 9 → assert `level === 3 && xp === 9`, hàm trả về 2
  - `applyXp caps at maxLevel`
  - `titleFor(20).aura === true`, `titleFor(19).name === 'Sát thủ ao làng'`

- [ ] **Step 2: Chạy test** → FAIL.
- [ ] **Step 3: Viết code.** Chọn bậc: duyệt các bậc theo thứ tự `trash, common, rare, epic, legendary`, cộng dồn trọng số, so với `rng()*100`. Chọn cá trong bậc bằng `floor(rng()*n)`. Cân nặng = `min + rng()*(max-min)`, nhân 1.2 nếu có bonus, làm tròn 0.1.
- [ ] **Step 4: Chạy test** → PASS.
- [ ] **Step 5: Commit** `feat: chọn cá và hệ thống cấp`

---

### Task 3: Bến câu và hàng chờ

**Files:**
- Create: `server/game/dock.js`
- Test: `tests/dock.test.js`

**Interfaces:**
- Consumes: Config (Task 1)
- Produces:
  - `createDock(config) -> Dock` với `{seats: Array<Seat|null>, queue: Array<{user, lastActive}>}`
  - `touch(dock, user, now) -> {result: 'seated'|'queued'|'already_seated'|'promoted'|'queue_full', seatIndex?}`. Hàm này dùng cho mọi tương tác: người lạ thì xếp chỗ, người đang ngồi thì cập nhật `lastActive`, người đang chờ thì đưa lên đầu hàng.
  - `sweepIdle(dock, now) -> Array<{userId, name, seatIndex}>` (danh sách người bị rời bến, đồng thời đưa người đầu hàng chờ vào chỗ trống. Kết quả kèm trường `filled: Array<{seatIndex, user}>`)
  - `kick(dock, userId) -> boolean`
  - `seatOf(dock, userId) -> number` (-1 nếu không ngồi)
  - Seat: `{user, lastActive, ...}`. Task 4 gắn thêm các trường câu cá vào đối tượng này.

- [ ] **Step 1: Viết test (fail trước):**
  - `join fills first empty seat`
  - `join twice keeps one seat` *(Review Focus 1)*: hai lần `touch` → lần hai trả `already_seated`, chỉ có 1 ghế bị chiếm
  - `13th user goes to queue`. `queued twice keeps one entry` *(Review Focus 1)*
  - `queued user who interacts is promoted to front`: hàng chờ [A,B,C], C tương tác → [C,A,B], kết quả `promoted`
  - `queue_full beyond queueMax`
  - `idle 300s leaves and first queued fills seat`: `sweepIdle(dock, t0 + 300_000)` → A rời đi, người đầu hàng chờ ngồi đúng ghế của A
  - `idle 299s stays`
  - `queued idle 300s dropped from queue`
  - `kick frees seat and pulls from queue on next sweep`

- [ ] **Step 2: Chạy test** → FAIL. **Step 3:** Viết code. **Step 4:** Chạy test → PASS.
- [ ] **Step 5: Commit** `feat: bến câu và hàng chờ`

---

### Task 4: Bộ máy game (vòng câu + tương tác)

**Files:**
- Create: `server/game/engine.js`, `server/game/commands.js`
- Test: `tests/engine.test.js`, `tests/commands.test.js`

**Interfaces:**
- Consumes: Task 2 (`rollCatch`, `xpForCatch`, `applyXp`, `titleFor`), Task 3 (dock), Task 5 qua `players` (đối tượng có `getOrCreate(user, now) -> {record, isReturning}`, `recordCatch(userId, catchResult, now)`, `markDirty()`). Trong test thì dùng một bản giả viết sẵn trong file test.
- Produces:
  - `parseCommand(config, text) -> 'cast'|'reel'|null` (nằm trong `commands.js`): bỏ dấu tiếng Việt (`normalize('NFD')`, xóa dấu kết hợp, đổi `đ` thành `d`), chuyển chữ thường, cắt khoảng trắng. Khớp nếu **từ đầu tiên** trùng một lệnh trong config.
  - `createGame({config, players, rng}) -> Game`
  - `game.handle(event: StdEvent, now) -> DisplayEvent[]`
  - `game.tick(now) -> DisplayEvent[]`
  - `game.kick(userId, now) -> DisplayEvent[]`
  - `game.snapshot(now) -> Snapshot` (dùng `leaderboard()` từ Task 5)
  - `game.session`: `{kgByUser: Map, followed: Set, shares: Map}`

- [ ] **Step 1: Viết test `commands.test.js`:** `"Câu"`, `"cau di"`, `"CÂU!!"` (sau khi bỏ dấu câu ở cuối) → `cast`. `"kéo"`, `"keo"` → `reel`. `"câu cá vui quá"` → `cast`. `"xin chào"` → `null`.

- [ ] **Step 2: Viết test `engine.test.js`.** Mỗi test tạo game bằng `seqRng` hoặc `createRng(42)`, cộng với `players` giả và `now` tăng tay. Các test:
  - `join seats player and emits seat`. `returning player emits welcome_back with level/title`
  - `idle auto-casts after 2s`: tick ở +2000 → phase `casting`, có sự kiện `cast`
  - `full cycle`: casting 1s → waiting (25–40s, theo rng) → bite → hết 4s tự kéo → reeling 1.5s → result (sự kiện `catch` + cập nhật xp) → 3s sau → idle
  - `likes shorten wait by 0.3s each, floored at 50%`: chờ 30s, 10 tim → `phaseEndsAt` lùi 3s. 1000 tim → không lùi quá 15s kể từ lúc bắt đầu chờ.
  - `chat "câu" casts immediately when idle; ignored when waiting`
  - `chat "kéo" during bite sets reelBonus and moves to reeling now`
  - `bite window expiry still lands fish`
  - `follow grants 5 bait once per session`: follow 2 lần → chỉ có 1 sự kiện `follow_thanks`, bait = 5
  - `share grants 3 bait up to 3 times`
  - `bait consumed one per catch and passed to rollCatch`
  - `gift 5 coins → fast 60s, wait ×0.5; stacking capped at 300s`
  - `gift 50 coins → +10 bait, gift event fireworks small`
  - `gift 500 coins → legendary flag for next catch only, then cleared`
  - `interaction from unseated user seats them` (tim từ người lạ → `seat`)
  - `level_up emitted with new title`
  - `kicked during reeling then chats: no crash, no catch recorded, re-seated fresh` *(Review Focus 3)*
  - `idle 300s via tick emits leave and seats queued player`
  - `session kg accumulates per user`

- [ ] **Step 3: Chạy test** → FAIL.
- [ ] **Step 4: Viết code.** Mỗi seat có `{phase, phaseStartedAt, phaseEndsAt, waitTotal, bait, legendary, fastUntil, reelBonus, lastCatch}`. Thời gian chờ = `rand(waitSec) × (now < fastUntil ? waitMultiplier : 1)`. Điểm chặn dưới khi tim rút ngắn = `phaseStartedAt + waitTotal × minWaitRatio`. Chỉ hàm `tick` mới chuyển phase theo thời gian. Lệnh chat chuyển phase ngay khi nhận được.
- [ ] **Step 5: Chạy test** → PASS.
- [ ] **Step 6: Commit** `feat: bộ máy game câu cá`

---

### Task 5: Kho dữ liệu người chơi + bảng xếp hạng

**Files:**
- Create: `server/store/playerStore.js`, `server/game/leaderboard.js`
- Test: `tests/store.test.js`, `tests/leaderboard.test.js`

**Interfaces:**
- Produces:
  - `createPlayerStore(filePath, {log?}) -> Store` với các hàm:
    - `load()`
    - `getOrCreate(user, now) -> {record, isReturning}` (`isReturning` = đã có từ phiên trước, tức `lastSeen` sớm hơn lúc server khởi động)
    - `recordCatch(userId, catchResult, now)` (cập nhật `totalKg`, `catches`, `collection`, và `records[YYYY-MM-DD]` nếu cá nặng hơn kỷ lục)
    - `todayRecord(now) -> {userId, name, fishName, kg}|null`
    - `markDirty()`
    - `saveNow() -> Promise` (ghi `file.tmp` rồi `rename`. Đang ghi mà có lệnh ghi mới thì chạy thêm đúng một lần nữa sau khi xong)
    - `startAutosave(ms)`, `stop() -> Promise` (lưu lần cuối)
  - Ngày tính theo giờ máy: `localDateKey(now) -> 'YYYY-MM-DD'`
  - `leaderboard({session, store, players, now, top}) -> {session:[{name,kg}], today}`

- [ ] **Step 1: Viết test (fail trước),** dùng thư mục tạm `fs.mkdtempSync`:
  - `roundtrip`: tạo người chơi, ghi một con cá, `saveNow`, tạo store mới rồi `load` → dữ liệu khớp và `isReturning === true`
  - `missing file starts empty`
  - `corrupt file renamed to players.corrupt-*.json and starts empty`
  - `atomic: no .tmp left after save`. `concurrent saveNow calls both resolve and final file has latest data`
  - `collection tracks count and bestKg`
  - `today record updates only when heavier`
  - `today record rolls over at local midnight` *(Review Focus 4)*: câu ở 23:59 ngày 1, sau đó câu cá nhẹ hơn ở 00:01 ngày 2 → `todayRecord` ngày 2 là con cá nhẹ hơn
  - `leaderboard`: top 5 xếp theo kg giảm dần, bỏ người có 0kg

- [ ] **Step 2: Chạy test** → FAIL. **Step 3:** Viết code. **Step 4:** Chạy test → PASS.
- [ ] **Step 5: Commit** `feat: lưu người chơi và bảng xếp hạng`

---

### Task 6: Bộ dịch sự kiện TikTok + lọc tên

**Files:**
- Create: `server/events/normalize.js`, `server/events/sanitize.js`
- Test: `tests/normalize.test.js`

**Interfaces:**
- Produces:
  - `sanitizeName(raw, maxChars) -> string` (bỏ ký tự điều khiển và ký tự định dạng vô hình, cắt theo grapheme bằng `Intl.Segmenter`, thêm `…` nếu bị cắt. Rỗng thì trả `'Cần thủ'`)
  - `sanitizeAvatar(url) -> string|null` (chỉ nhận `https:`)
  - `normalizeTikTok(eventName, data, config) -> StdEvent|null`

- [ ] **Step 1: Viết test (fail trước).** Thư viện có hai dạng dữ liệu (v1 phẳng, v2 lồng trong `data.user`), nên hàm đọc cả hai: `u = data.user ?? data`, `id = u.userId ?? u.uniqueId`, `name = u.nickname ?? u.uniqueId`, `avatar = u.profilePictureUrl ?? u.profilePicture?.url?.[0]`.
  - `member → join`. `like` dùng `likeCount` → `count`. `chat` dùng `comment` → `text`. `follow`. `share`.
  - `social` có `displayType` chứa `follow` hoặc `share` → `follow`/`share` (phòng khi thư viện gửi dưới dạng `social`)
  - `gift non-streak` (`giftType !== 1`) → `coins = diamondCount × repeatCount`
  - `gift streak in progress returns null; repeatEnd returns total` *(Review Focus 2)*
  - `unknown event returns null`. `missing user id returns null`
  - `sanitizeName('🔥🔥🔥​')` cho kết quả hiển thị được, còn `sanitizeName('\u0000​')` → `'Cần thủ'` *(Review Focus 5)*
  - `sanitizeName('NguyễnVănAnhTuấn', 12)` → 12 grapheme + `…`
  - `sanitizeAvatar('http://x')` → `null`

- [ ] **Step 2: Chạy test** → FAIL. **Step 3:** Viết code. **Step 4:** Chạy test → PASS.
- [ ] **Step 5: Commit** `feat: chuẩn hóa sự kiện TikTok`

---

### Task 7: Bộ nghe TikTok (tự kết nối lại)

**Files:**
- Create: `server/tiktok/listener.js`
- Test: `tests/listener.test.js`

**Interfaces:**
- Consumes: `normalizeTikTok` (Task 6)
- Produces: `createListener({config, connect: (username) => Connection, onEvent: (StdEvent) => void, onStatus: ({tiktok, message}) => void, schedule = setTimeout})` → `{start(username), stop()}`.
  - `Connection` là một EventEmitter có `connect() -> Promise` và `disconnect()`.
  - Hàm `connect` mặc định (viết trong `server/index.js`) bọc thư viện, `new WebcastPushConnection(username)` ở v1 hoặc `new TikTokLiveConnection(username)` ở v2. **Kiểm tra README của gói vừa cài trong `node_modules/tiktok-live-connector` để dùng đúng tên lớp và tên sự kiện.**
  - Lịch thử lại: 5s, 10s, 30s, sau đó cứ 30s một lần. Lỗi có chứa `"offline"`/`"isn't online"`/`"LIVE has ended"` → trạng thái `not_live`. Lỗi khác → `retrying`. Kết nối thành công thì bộ đếm thử lại quay về 0.

- [ ] **Step 1: Viết test** với `Connection` giả và `schedule` giả (ghi lại độ trễ):
  - `connected status and events forwarded`
  - `disconnect triggers retry delays 5000,10000,30000,30000`
  - `offline error → not_live status`
  - `stop cancels pending retry and disconnects`
  - `success resets backoff`
- [ ] **Step 2: Chạy test** → FAIL. **Step 3:** Viết code. **Step 4:** Chạy test → PASS.
- [ ] **Step 5: Commit** `feat: bộ nghe TikTok tự kết nối lại`

---

### Task 8: Server (HTTP, WebSocket, gom sự kiện, giả lập)

**Files:**
- Create: `server/index.js`, `server/app.js`, `server/sim/simulator.js`
- Test: `tests/batcher.test.js`, `tests/simulator.test.js`

**Interfaces:**
- Consumes: tất cả các task trước
- Produces:
  - `createBatcher({batchMs, onFlush: (StdEvent[]) => void, schedule})` → `{push(ev), flushNow()}`. Tim của cùng một người trong một lần gom được cộng dồn thành một sự kiện `like`.
  - `createSimulator({rng}) -> {make(kind, opts, seatedUsers) -> StdEvent[], storm({durationSec:60, users:50, likesPerMin:3000}, emit, schedule) -> stop()}`. Các `kind`: `join1`, `join20`, `likes500`, `gift` (`coins`), `follow`, `share`, `chatCast`, `chatReel`. Người giả có `id` dạng `sim_<n>`, tên Việt ngẫu nhiên, `avatar: null`.
  - `startServer(config) -> {close()}` trong `app.js`. `index.js` chỉ gọi `loadConfig`, `startServer` và bắt SIGINT/SIGTERM để gọi `store.stop()` trước khi thoát.
  - HTTP tĩnh: `/game` → `public/game/index.html`, `/admin` → `public/admin/index.html`, các file còn lại trong `public/` (chặn `..`), và `/config.json` trả về nhóm `ui`, `assets`, `leaderboard` của config cho client.

- [ ] **Step 1: Viết test batcher:** `coalesces likes per user within window`, `preserves order of non-like events`, `flushNow empties buffer`.
- [ ] **Step 2: Viết test simulator:** `join20 yields 20 distinct users`, `chatCast picks a seated user`, `storm emits about 3000 likes/min` (dùng schedule giả).
- [ ] **Step 3: Chạy test** → FAIL. **Step 4:** Viết code. Vòng lặp: `tick` mỗi `tickMs`. Batcher flush → `game.handle` từng sự kiện → gộp DisplayEvent, cắt còn `maxDisplayEventsPerFlush` (ưu tiên giữ `catch` bậc cao, `gift`, `level_up`) → broadcast `events`. Gửi snapshot mỗi `snapshotMs`, status mỗi 1s. Đếm `eventsPerMin` theo cửa sổ trượt 60s.
- [ ] **Step 5: Chạy test** → PASS. Chạy thử `npm start` → log `Câu Cá chạy tại http://localhost:3000`. `curl localhost:3000/config.json` trả về JSON.
- [ ] **Step 6: Commit** `feat: server, websocket, giả lập`

---

### Task 9: Bảng điều khiển host (`/admin`)

**Files:**
- Create: `public/admin/index.html`, `public/admin/admin.js`, `public/admin/admin.css`
- Shared: `public/shared/ws.js` (`connectWs(onMessage) -> {send}`, tự kết nối lại sau 1–5s. Task 10 cũng dùng file này.)

**Interfaces:**
- Consumes: giao thức WebSocket ở phần Hợp đồng chung

- [ ] **Step 1:** **Gọi skill `frontend-design`** trước khi viết UI. Phong cách: bảng điều khiển gọn, tối giản, có hỗ trợ giao diện tối, chữ tiếng Việt.
- [ ] **Step 2:** Viết các phần: ô `@username` cùng nút Kết nối và Ngắt. Đèn trạng thái (xanh: `connected`, vàng: `connecting`/`retrying`/`not_live`, đỏ: `error`, xám: `offline`) kèm dòng `message`. Ba chỉ số (trên bến, đang chờ, sự kiện/phút). Lưới nút giả lập: +1 người, +20 người, Mưa tim, Quà 1/50/500 xu, Follow, Share, Gõ "câu", Gõ "kéo". Nút **Bão sự kiện** (đổi thành Dừng khi đang chạy). Danh sách người trên bến kèm nút Kick. Link mở `/game` ở tab mới.
- [ ] **Step 3: Kiểm tra** bằng trình duyệt có sẵn: `npm start`, mở `/admin`, bấm +20 người → chỉ số "trên bến" = 12, "đang chờ" = 8. Kick 1 người → danh sách cập nhật. Console không có lỗi.
- [ ] **Step 4: Commit** `feat: bảng điều khiển host`

---

### Task 10: Trang game: cảnh, sprite, nhân vật

**Files:**
- Create: `public/game/index.html`, `public/game/main.js`, `public/game/layout.js`, `public/game/sprites/registry.js`, `public/game/sprites/pixel.js`, `public/game/sprites/fish.js`, `public/game/sprites/character.js`, `public/game/sprites/scene.js`, `public/game/render/scene.js`, `public/game/render/characters.js`, `public/game/assets/.gitkeep`
- Test: `tests/layout.test.js` (chỉ test các hàm thuần trong `layout.js`)

**Interfaces:**
- Consumes: `/config.json`, các tin `snapshot`/`events`, `public/shared/ws.js`
- Produces:
  - `layout.js`: `seatPosition(index, ui) -> {x, y}` (tọa độ low-res 270×480, 2 hàng × 6, hàng 2 thấp hơn và lệch nửa ô), `safeRect(ui) -> {top, bottom}` (high-res), `skyPhase(date) -> 'day'|'dusk'|'night'` (6–17 ngày, 17–19 chiều, còn lại đêm), `colorFromName(name) -> '#rrggbb'` (băm ổn định).
  - `registry.js`: `registerSprite(id, drawFn)`, `drawSprite(ctx, id, x, y, opts)`, `loadOverrides(assetsMap) -> Promise` (`assets` trong config: `{"fish.ca_loc": "assets/ca_loc.png"}`. Có ảnh PNG thì dùng `drawImage` thay cho hàm vẽ).
  - Mọi sprite đều có id: `fish.<id>` cho từng con cá trong config, `char.body`, `char.rod`, `fx.bobber`, `fx.splash`, `fx.exclaim`, `scene.dock`, `scene.tree`, `scene.mountain`, `scene.moon`.
  - Hai canvas chồng lên nhau: `#pixel` (270×480, CSS phóng ×4, `image-rendering: pixelated`) và `#hud` (1080×1920 cho chữ, Task 11 dùng). Container co theo cửa sổ với tỉ lệ 9:16 cố định.
  - Đồng bộ thời gian: `offset = snapshot.serverNow - Date.now()`, và animation phase tính từ `phaseEndsAt`.

- [ ] **Step 1: Viết test layout:** 12 vị trí khác nhau và nằm trong `[0,270)×[0,480)`. Tất cả nằm giữa `safeTop/4` và `480 - safeBottom/4`. `skyPhase` tại 5:59 → night, 6:00 → day, 17:30 → dusk. `colorFromName('abc')` cho kết quả ổn định.
- [ ] **Step 2: Chạy test** → FAIL. **Step 3:** Viết `layout.js`. **Step 4:** Chạy test → PASS.
- [ ] **Step 5:** **Gọi skill `frontend-design`**, sau đó vẽ: trời (gradient theo `skyPhase`, mây trôi, đêm có trăng và đom đóm), núi, cây, mặt hồ gợn sóng, bóng cá bơi, bến gỗ 2 hàng. Nhân vật: thân pixel màu `colorFromName`, cần câu màu `rodColor`, hào quang nếu `aura`, biểu tượng 🐉 nhỏ nếu `legendary`, biểu tượng mồi kèm số lượt nếu `bait > 0`. Animation theo phase: quăng (cần vung), chờ (phao nhấp nhô), bite (phao chìm và dấu `!` nhấp nháy), kéo (cần cong), result (giơ cá lên). Avatar tròn phía trên đầu, vẽ trên canvas `#hud`. Ảnh lỗi thì không vẽ avatar.
- [ ] **Step 6: Kiểm tra** bằng trình duyệt: mở `/game` khung 1080×1920 kết hợp admin +20 người → 12 nhân vật quăng, chờ, câu. Chụp màn hình. Console không có lỗi.
- [ ] **Step 7: Commit** `feat: trang game - cảnh và nhân vật`

---

### Task 11: Trang game: HUD, popup, dòng tin, bảng xếp hạng, pháo hoa

**Files:**
- Create: `public/game/render/hud.js`, `public/game/render/popups.js`, `public/game/render/fx.js`, `public/game/text.js`
- Modify: `public/game/index.html` (thêm link Google Fonts: `VT323` và `Be Vietnam Pro`, subset vietnamese, có font dự phòng `monospace`/`sans-serif`), `public/game/main.js`

**Interfaces:**
- Consumes: Task 10 (`#hud`, `safeRect`, registry), tin `events`, `/config.json`
- Produces: `drawOutlinedText(ctx, text, x, y, {font, size, color, outline:'#000', width:6, align})` trong `text.js`

- [ ] **Step 1:** Trên `#hud`, ngay dưới `safeTop`: bảng xếp hạng luân phiên mỗi `rotateSec` giữa **🏆 TOP PHIÊN** (5 dòng `1. tên  12.4kg`) và **🐟 CÁ TO NHẤT HÔM NAY** (`tên — Cá hô 54.2kg`). Đồng hồ HH:MM ở góc phải. Tên kèm `Lv.n` dưới mỗi avatar.
- [ ] **Step 2:** Popup: hàng đợi, tối đa `maxPopups` cái cùng lúc, mỗi cái hiện `popupSec` giây. Kích thước và màu theo bậc: trash xám kèm câu đùa, common trắng, rare xanh dương, epic tím có ánh lấp lánh, legendary vàng chiếm toàn chiều ngang kèm pháo hoa to. Nội dung: `@tên câu được` / `CÁ LÓC 2.3kg!`. Riêng rác: `@tên câu được… DÉP TỔ ONG 😂`.
- [ ] **Step 3:** Dòng tin `feedLines` = 3: `seat` → "@x vừa vào bến". `welcome_back` → "Chào mừng {title} cấp {n} @x quay lại!". `level_up` → "@x lên cấp {n} — {title}!". `follow_thanks` → "Cảm ơn @x đã follow! +5 mồi thơm". `share_thanks`. `gift`. `leave` → "@x đã về nhà".
- [ ] **Step 4:** Hướng dẫn luân phiên mỗi 5s ngay trên `safeBottom`: `Gõ "câu" để quăng cần` / `Thả tim ❤️ câu nhanh hơn` / `Follow nhận mồi thơm`, kèm `⏳ Đang chờ: n người` nếu có người chờ. Pháo hoa (`fx.js`) dùng hạt pixel trên `#pixel`, có loại `small` và `big`.
- [ ] **Step 5: Kiểm tra** bằng trình duyệt: chạy Bão sự kiện 60s → không giật thấy rõ, không có popup chồng quá 2 cái, chữ tiếng Việt hiển thị đủ dấu (ví dụ "Thần câu", "Đại sư biển cả", "Cá chép hóa rồng"), không có chữ nằm trong vùng an toàn. Tặng quà 500 xu → có pháo hoa to, nhân vật hiện biểu tượng 🐉 cho đến khi kết thúc lượt câu kế tiếp. Popup vàng bậc legendary được kiểm tra bằng cách tạm sửa config cho `legendary` = 100 (nhớ trả lại sau đó). Chụp màn hình.
- [ ] **Step 6: Commit** `feat: trang game - HUD, popup, pháo hoa`

---

### Task 12: README + kiểm tra toàn bộ

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Viết README tiếng Việt: yêu cầu (Node 24), `npm install`, `npm start`. Mở `/admin` rồi nhập username. Gắn vào **OBS** (Browser Source, URL `http://localhost:3000/game`, 1080×1920, FPS 30) và **TikTok LIVE Studio** (thêm nguồn Link/Browser với cùng URL). Chỉnh `config/game.config.json` (giải thích từng nhóm và cách thêm cá mới). Thay hình PNG qua `assets`. Sao lưu `data/players.json`. Xử lý sự cố: kênh chưa live, mất kết nối, config sai.
- [ ] **Step 2:** `npm test` → mọi test PASS.
- [ ] **Step 3:** Kiểm tra cuối: khởi động server, chạy Bão sự kiện, tắt bằng Ctrl+C trong lúc đang bão rồi mở lại → người chơi cũ vẫn còn và hiện "quay lại". Sửa config sai (`tiers.common = 50`) → server từ chối chạy và báo lỗi rõ ràng, sửa lại đúng thì chạy được.
- [ ] **Step 4: Commit** `docs: README hướng dẫn`
