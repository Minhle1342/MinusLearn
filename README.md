# MinusLearn

MinusLearn la mot website hoc tu vung tieng Anh theo chu de, tap trung vao viec them nhanh tu moi va on tap bang nhieu che do khac nhau. Du an hien tai gom mot frontend React + Vite va mot Chrome extension nho de gui nhanh doan text vao man hinh them tu bang AI.

## Tinh nang hien tai

- Quan ly tu vung theo chu de voi sidebar rieng cho tung topic.
- Them tu vung thu cong gom tu, phien am, nghia, cau vi du va anh minh hoa.
- Them hang loat bang AI tu mot doan text hoac danh sach tu.
- Tu dong tao anh minh hoa cho tu vung khi cau hinh model anh ho tro.
- Tim kiem tu vung va chuyen doi giua card view va flashcard view.
- Luyen nghe bang Speech Synthesis, nhap dap an, luu danh sach cau sai de on lai.
- Luyen doc hieu bang cau dien tu voi 4 lua chon.
- On tap bang spaced repetition voi co che danh gia `Quen`, `Kho`, `Tot`, `De`.
- Theo doi streak hoc tap dua tren lich su on tap.
- Dong bo topic voi extension va nhan text clip qua URL param de mo san modal AI.

## Cong nghe su dung

- React 18
- Vite 5
- Tailwind CSS
- Lucide React
- LocalStorage de luu du lieu hoc tap tren trinh duyet

## Cau truc thu muc

```text
frontend/   Ung dung web chinh
extension/  Chrome extension clip text vao MinusLearn
.agent/     Tai lieu thiet ke va dinh huong giao dien
```

## Cach chay local

### 1. Cai dependencies

```bash
cd frontend
npm install
```

### 2. Tao file moi truong

Sao chep file mau:

```bash
cp .env.example .env
```

Hoac tren Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Bien moi truong dang dung:

```env
VITE_GEMINI_DEFAULT_KEY=
VITE_GEMINI_DEFAULT_MODEL=gemini-3.1-flash-lite-preview
```

### 3. Chay dev server

```bash
npm run dev
```

Mac dinh Vite se chay tai `http://localhost:5173`.

### 4. Build production

```bash
npm run build
```

## Cach su dung website

1. Tao mot chu de moi trong sidebar.
2. Them tu vung thu cong hoac mo tab AI de dan danh sach tu/cum tu.
3. Cau hinh API key trong Settings neu muon dung tinh nang AI.
4. Chuyen qua cac tab `Vocabulary`, `Listening`, `Reading`, `Review` de hoc.
5. Theo doi cac tu sai va tien do on tap ngay trong ung dung.

## Chrome extension

Thu muc `extension/` chua mot extension don gian de gui text vao MinusLearn.

- Ten extension: `MinusLearn Clipper`
- Muc dich: highlight text va day sang modal them tu bang AI
- Pham vi hien tai: content script dang match `http://localhost:5173/*`

De cai dat thu cong tren Chrome:

1. Mo `chrome://extensions`
2. Bat `Developer mode`
3. Chon `Load unpacked`
4. Tro toi thu muc `extension`

## Luu y hien tai

- Du lieu hoc tap hien duoc luu o LocalStorage, chua co backend dong bo tai khoan.
- API key duoc doc tu bien moi truong frontend hoac luu trong settings local cua nguoi dung.
- File `frontend/.env` da duoc ignore de tranh commit thong tin nhay cam.

## Trang thai du an

Website hien da build thanh cong o moi truong local va co the tiep tuc mo rong theo cac huong:

- Bo sung backend va dang nhap de dong bo du lieu
- Hoan thien luong AI va xu ly loi tot hon
- Mo rong extension cho nhieu domain hon
