import express from "express";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "replace-with-secure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

const API_BASE = process.env.API_BASE || "https://your-server.example.com";
const API_USERNAME = process.env.API_USERNAME || "";
const API_PASSWORD = process.env.API_PASSWORD || "";
const PORT = process.env.PORT || 3000;

function basicAuthHeader() {
    return "Basic " + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString("base64");
}

// 简单代理：获取挂载点列表
app.get("/api/mounts", async (req, res) => {
    try {
        const r = await fetch(`${API_BASE}/mounts`, {
            headers: { Authorization: basicAuthHeader() }
        });
        const data = await r.json();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 简单代理：发起挂载/卸载 （body: { action: "mount" | "unmount" }）
app.post("/api/mounts/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const action = req.body.action || "mount";
        // 根据对方 API 调整路径与方法
        const url = `${API_BASE}/mounts/${encodeURIComponent(id)}/${encodeURIComponent(action)}`;
        const r = await fetch(url, {
            method: "POST",
            headers: { Authorization: basicAuthHeader(), "Content-Type": "application/json" },
            body: JSON.stringify(req.body)
        });
        const data = await r.json();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 简单代理：列出挂载内文件（query: path）
app.get("/api/files/:mountId", async (req, res) => {
    try {
        const mountId = req.params.mountId;
        const path = req.query.path || "/";
        const url = `${API_BASE}/mounts/${encodeURIComponent(mountId)}/files?path=${encodeURIComponent(String(path))}`;
        const r = await fetch(url, { headers: { Authorization: basicAuthHeader() } });
        const data = await r.json();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 静态文件（包含 public/Drive）
app.use(express.static("public"));

app.listen(PORT, () => console.log("server running on", PORT));
