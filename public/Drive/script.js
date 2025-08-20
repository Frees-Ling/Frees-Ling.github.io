// --- 配置项 ---
const config = {
    owner: "Frees-Ling",
    repo: "Frees-Ling.github.io",
    branch: "main",
    path: "Drive/Files"
};

// --- 加密 token ---
const encryptedToken = "U2FsdGVkX1+maVnBWRqWhIlKs5kx1JPLdh/gY+A3mfAV3n/zLQ3zfsbvPCTlf+/yrr9h4rXnqwD53/TRnAiHlQ=="; // 替换成你加密后的 token
const password = "20250817"; // 用来解密的密码

// 自动解密 token
function decryptToken() {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedToken, password);
        const token = bytes.toString(CryptoJS.enc.Utf8);
        return token || "";
    } catch (err) {
        console.error("解密 token 出错:", err);
        return "";
    }
}

// 请求头
const token = decryptToken();
const headers = token ? { Authorization: `token ${token}` } : {};

// 获取文件夹内容
async function fetchContents(path = "") {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    return res.json();
}

// 递归生成文件树 DOM
async function buildTree(container, path) {
    const items = await fetchContents(path);
    const ul = document.createElement("ul");

    for (const item of items) {
        const li = document.createElement("li");

        if (item.type === "dir") {
            const span = document.createElement("span");
            span.textContent = "📁 " + item.name;
            span.className = "cursor-pointer font-semibold";
            span.onclick = async () => {
                if (li.querySelector("ul")) {
                    li.querySelector("ul").classList.toggle("hidden");
                } else {
                    await buildTree(li, item.path);
                }
            };
            li.appendChild(span);
        } else if (item.type === "file") {
            const a = document.createElement("a");
            a.href = item.download_url;
            a.textContent = "📄 " + item.name;
            a.className = "text-blue-600 hover:underline";
            a.target = "_blank";
            li.appendChild(a);
        }

        ul.appendChild(li);
    }

    container.appendChild(ul);
}

// 初始化
const fileTreeContainer = document.getElementById("file-tree");
buildTree(fileTreeContainer, config.path).catch(console.error);
