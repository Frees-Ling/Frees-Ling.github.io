const apiGet = async (path) => {
    const r = await fetch(path, { credentials: "same-origin" });
    if (r.status === 401) throw new Error("not_authenticated");
    return r.json();
};

const apiPost = async (path, body) => {
    const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin"
    });
    return r.json();
};

function ensureContainer(id, placeholderHtml) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.innerHTML = placeholderHtml || "";
        const content = document.querySelector(".content");
        if (content) content.appendChild(el);
        else document.body.appendChild(el);
    }
    return el;
}

function createButton(text, onClick) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.marginLeft = "8px";
    b.addEventListener("click", onClick);
    return b;
}

export async function loadMounts() {
    const mountsEl = ensureContainer("mounts", "正在加载挂载点…");
    mountsEl.innerHTML = "加载中...";
    try {
        const data = await apiGet("/api/mounts");
        const list = data.mounts || data || [];
        mountsEl.innerHTML = "";
        if (!list.length) {
            mountsEl.innerText = "暂无挂载点";
            return;
        }
        list.forEach(m => {
            const div = document.createElement("div");
            div.style.border = "1px solid rgba(0,0,0,0.08)";
            div.style.padding = "8px";
            div.style.margin = "8px 0";
            const title = document.createElement("strong");
            title.textContent = m.name || m.id;
            div.appendChild(title);
            const status = document.createElement("span");
            status.style.marginLeft = "8px";
            status.textContent = m.status ? `(${m.status})` : "";
            div.appendChild(status);

            const mountBtn = createButton(m.mounted ? "卸载" : "挂载", async () => {
                await apiPost("/api/mounts/" + encodeURIComponent(m.id), { action: m.mounted ? "unmount" : "mount" });
                loadMounts();
            });
            const viewBtn = createButton("浏览", () => loadFiles(m.id));
            div.appendChild(mountBtn);
            div.appendChild(viewBtn);
            mountsEl.appendChild(div);
        });
    } catch (err) {
        mountsEl.innerText = "请求失败，请检查服务端配置。";
        console.error(err);
    }
}

export async function loadFiles(mountId, path = "/") {
    const filesEl = ensureContainer("files", "正在加载文件列表…");
    filesEl.innerHTML = "加载中...";
    try {
        const data = await apiGet("/api/files/" + encodeURIComponent(mountId) + "?path=" + encodeURIComponent(path));
        const files = data.files || [];
        filesEl.innerHTML = "<h3>文件列表</h3>";
        if (!files.length) {
            const n = document.createElement("div");
            n.textContent = "该目录为空";
            filesEl.appendChild(n);
            return;
        }
        files.forEach(f => {
            const row = document.createElement("div");
            row.style.marginTop = "6px";
            row.textContent = `${f.name} (${f.size ?? "-"}) `;
            if (f.download_url) {
                const a = document.createElement("a");
                a.href = f.download_url;
                a.textContent = "[下载]";
                a.target = "_blank";
                a.style.marginLeft = "8px";
                row.appendChild(a);
            }
            filesEl.appendChild(row);
        });
    } catch (err) {
        filesEl.innerText = "读取文件失败，请检查服务端日志。";
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // 如果页面希望展示授权链接（OAuth 流程），保留 id="auth" 的链接即可。
    const authLink = document.getElementById("auth");
    if (authLink) authLink.href = "/auth/start";
    loadMounts();
});