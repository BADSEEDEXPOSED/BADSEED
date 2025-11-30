# BADSEED Development Server Commands

## Quick Start (All Servers)

### Kill All Node Processes
```powershell
taskkill /F /IM node.exe
```

### Start Netlify Functions Server (Port 9998)
```powershell
cd c:\Users\aandr\OneDrive\Documentos\Projects\BADSEED\badseed-exposed
netlify functions:serve --port 9998
```

### Start React Dev Server (Port 3000)
```powershell
cd c:\Users\aandr\OneDrive\Documentos\Projects\BADSEED\badseed-exposed
npm start
```

---

## Opening the App in Antigravity IDE Browser

### Exact Steps:

1. **Look at the top-right corner of your VS Code window**
   - You should see a browser icon (🌐) or "Simple Browser" button

2. **Click the browser icon** OR use keyboard shortcut:
   - Press `Ctrl+Shift+P` (Command Palette)
   - Type: `Simple Browser: Show`
   - Press Enter

3. **In the browser address bar that appears:**
   - Enter: `http://localhost:3000`
   - Press Enter

4. **The app will load in the built-in browser** with Antigravity extension support

### Screenshot of Queue Controls

![Queue Controls](file:///C:/Users/aandr/.gemini/antigravity/brain/5baa130e-ae09-4983-a2a2-35985be341df/queue_controls_1764530015350.png)

The app is now running with all three admin buttons visible:
- ⚡ Force Post Now
- 🧪 Add Test Item  
- 🗑️ Clear Queue

---

## Typical Workflow

1. **Kill existing servers** (if any are running):
   ```powershell
   taskkill /F /IM node.exe
   ```

2. **Start Netlify Functions** (in Terminal 1):
   ```powershell
   cd c:\Users\aandr\OneDrive\Documentos\Projects\BADSEED\badseed-exposed
   netlify functions:serve --port 9998
   ```
   Wait for: `Local dev server ready: http://localhost:9998`

3. **Start React App** (in Terminal 2):
   ```powershell
   cd c:\Users\aandr\OneDrive\Documentos\Projects\BADSEED\badseed-exposed
   npm start
   ```
   Wait for: `Compiled successfully!`

4. **Open in browser**: `http://localhost:3000`

---

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:
```powershell
# Kill all Node processes
taskkill /F /IM node.exe

# Check if port is still in use
netstat -ano | findstr :9998
netstat -ano | findstr :3000

# If still in use, find the PID and kill it
taskkill /F /PID <PID_NUMBER>
```

### Proxy Errors (404s)
- Ensure Netlify functions server is running on port 9998
- Ensure `src/setupProxy.js` has `target: 'http://localhost:9998'`
- Restart React dev server after changing proxy config

### Environment Variables
- Ensure `.env` file exists in project root
- Required variables: `X_CONSUMER_KEY`, `X_CONSUMER_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `OPENAI_API_KEY`

---

## Server URLs

- **React App**: http://localhost:3000
- **Netlify Functions**: http://localhost:9998
- **Queue API**: http://localhost:3000/.netlify/functions/queue-get
- **X Poster API**: http://localhost:3000/.netlify/functions/x-poster
