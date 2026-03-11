<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Studio App (React + Vite + Node.js)

這是一個使用 React 19 與 Vite 建立的前端，搭配 Node.js (Express) 與 SQLite 的全端專案。已整合 Gemini API 應用。

## 系統需求
- Node.js (建議 v18 以上版本)
- NPM 或 Yarn

## 本地端運行 (Run Locally)

1. **安裝依賴套件 (Install dependencies)：**
   ```bash
   npm install
   ```

2. **設定環境變數：**
   將專案中的 `.env.example` 複製一份並命名為 `.env.local`，接著將您的 Gemini API 密鑰填入：
   ```bash
   cp .env.example .env.local
   # 編輯 .env.local 並填入 GEMINI_API_KEY
   ```

3. **啟動開發伺服器：**
   ```bash
   npm run dev
   ```
   *這將會同時啟動 Vite 前端開發伺服器以及 Backend Express Server。*

4. **編譯打包 (Build for production)：**
   ```bash
   npm run build
   ```
   *編譯後的靜態檔案會產生在 `dist/` 資料夾中。*

## 部署上線 (Deployment)

專案已設定好 **GitHub Actions** (`.github/workflows/deploy.yml`) 來協助您自動部署至 **GitHub Pages**。

### 部署方式說明：
1. 將專案推送到 GitHub。
2. 進入 GitHub 專案的 **Settings** > **Pages**。
3. 在 **Build and deployment** 區塊，將 **Source** 設定為 **GitHub Actions**。
4. 每當您將程式碼推送到 `main` 分支時，GitHub Action 就會自動執行編譯並將結果部署為 GitHub Pages。

*如果您有後端 API ( Express Server )，由於 GitHub Pages 不支援後端運行，您需要另外將服務器部署至如 Render/Railway/Fly.io 等平台，並修改此 Action 步驟。原版本的 CI/CD 也已於歷史紀錄中保留，供您作為 VPS SSH 部署的參考。*

## 套件與配置
- **`.gitignore`**：我們已預先配置完整的忽略規則（包括 `node_modules`, `.env`, `dist` 等），避免把敏感資料與暫存檔推上 Git。
- **`package.json`**：列出了專案所需的 React, Vite, TailwindCSS 等核心工具，只需下達 `npm install` 即可自動補齊。

