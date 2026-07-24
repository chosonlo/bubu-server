# 小熊日志 · 云端 WebSocket 后端

這個文件夾是獨立的 Node.js 後端，用於部署到免費雲端平台。

## 功能
- WebSocket 實時消息轉發（配對、留言、想你、照片交換、狀態同步）
- Web Push 推送通知
- 心跳機制保持雲端長連接

## 部署平台選擇

### 推薦 1：Suga（免費、不睡眠、不用信用卡）
1. 訪問 https://suga.io 註冊帳號
2. 創建新 Project，選 Node.js
3. 上傳這個 `cloud-server` 文件夾（或連接 GitHub）
4. 啟動命令：`npm start`
5. 複製分配的域名，例如 `https://bubu-xxxxx.sugaapps.io`
6. WebSocket 地址就是 `wss://bubu-xxxxx.sugaapps.io/ws`

### 推薦 2：Kerit Cloud（免費、不睡眠）
1. 訪問 https://kerit.cloud 註冊
2. 創建 Node.js 服務
3. 上傳 `cloud-server` 文件夾
4. 啟動命令：`npm start`
5. 複製域名，得到 `wss://你的域名/ws`

### 備選 3：Render（免費但 15 分鐘無活動會睡眠）
1. 訪問 https://render.com
2. New Web Service → Upload 或 GitHub
3. Build Command: `npm install`
4. Start Command: `npm start`
5. 免費版會睡眠，不適合一天只用幾次的場景

## 部署後更新前端

拿到雲端 WebSocket 地址後，修改 `bubu-app/app.js` 中的 `getWsUrl()`：

```js
return 'wss://你的域名/ws';
```

然後重新部署前端到 CloudStudio。

## 注意事項
- VAPID 密鑰每次重啟會自動生成新的，所以推送通知訂閱在重啟後可能失效
- 如需固定 VAPID，可設置環境變量 `VAPID_PUBLIC_KEY` 和 `VAPID_PRIVATE_KEY`
- 房間數據存在內存，重啟後配對關係需要重新加入（但 App 會自動重連同一個 pairCode）
