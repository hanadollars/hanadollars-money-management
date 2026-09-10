# Money Management in Trading — HanaDollars

Công cụ quản lý vốn cho trader, gồm hai phần:

1. **Position sizer** — tính volume nên vào lệnh từ khoảng cách stop loss, ra số tiền SL, số tiền TP, tỷ lệ SL/TP, margin và free margin.
2. **Trading plan** — từ vốn hiện có, mục tiêu và thời hạn, tính ra số lệnh thắng ròng cần đạt, tiền mỗi lệnh thắng, nhịp độ theo tuần và theo tháng, cùng số lệnh phải giao dịch ở từng mức win rate. Mỗi kế hoạch lưu lại được để mở lại sau, hoặc export ra JSON.

Trang tĩnh thuần túy: không build step, không dependency, không backend. Mọi phép tính chạy trong trình duyệt. Kế hoạch đã lưu và thiết lập cá nhân nằm trong `localStorage` của chính trình duyệt đó — không có dữ liệu nào rời khỏi máy người dùng, và cũng không đồng bộ giữa các thiết bị.

## Cấu trúc

```
.
├── index.html                  # toàn bộ markup của hai tab
├── assets/
│   ├── styles.css              # design tokens và layout
│   ├── tabs.js                 # chuyển tab, đồng bộ với #hash
│   ├── position-sizer.js       # tab 1
│   └── trading-plan.js         # tab 2
├── vercel.json                 # cleanUrls, cache, security headers
├── robots.txt
└── .gitignore
```

## Deploy lên Vercel

**Cách 1 — qua GitHub (khuyến nghị)**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/<tên-repo>.git
git push -u origin main
```

Vào [vercel.com/new](https://vercel.com/new) → Import repo vừa push. Framework Preset để **Other**, Build Command và Output Directory để trống. Bấm Deploy.

**Cách 2 — qua CLI**

```bash
npm i -g vercel
vercel          # deploy preview
vercel --prod   # deploy production
```

## Chạy thử ở máy

```bash
python3 -m http.server 3000
```

Rồi mở `http://localhost:3000`. Mở trực tiếp file `index.html` bằng `file://` cũng chạy được, nhưng nên dùng server để đường dẫn `/assets/...` hoạt động đúng như trên production.

## Sửa gì ở đâu

| Việc cần làm | File | Chỗ cần sửa |
|---|---|---|
| Đổi màu thương hiệu | `assets/styles.css` | khối `:root` |
| Đổi câu quote hoặc tiêu đề | `index.html` | thẻ `<blockquote>`, `<h1>` |
| Thêm cặp giao dịch | `index.html` + `assets/position-sizer.js` | `<select id="pair">` và hằng số `SPECS`, `SEED` |
| Sửa contract size | `assets/position-sizer.js` | hằng số `SPECS` |
| Sửa tỷ giá quy đổi cross pair | `assets/position-sizer.js` | hằng số `RATES` |

Giá mặc định trong `SEED` chỉ là số mồi cho form không trống, **không phải giá real-time**.

## Giới hạn

Trang này chỉ làm số học trên những gì người dùng nhập vào. Không có giá real-time, không dự báo thị trường, không đảm bảo win rate nào. Contract size theo chuẩn phổ biến của broker — luôn đối chiếu với Symbol Specification của sàn đang dùng trước khi vào lệnh thật.

---

Built by **HanaDollars**
