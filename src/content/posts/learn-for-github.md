---
title: Github入门
published: 2025-09-24
description: 'Github入门'
image: ''
tags: [Github, Learn]
category: 'Note'
draft: false 
lang: ''
---

# Github入门
## 什么是Github
Github是一个基于Git的代码托管平台，允许开发者存储、管理和协作开发代码。它提供了版本控制、分支管理、问题跟踪等功能，是开源项目和团队协作的理想选择。
## 注册Github账号
首先进入[Github官网](https://github.com/)，点击此可以进入，可以看到如下图的界面

![](https://vip.123pan.cn/1816365004/yk6baz03t0n000d7w33hcmcd3n7k6yleDIYPAqDzAIaOAcxvDdawDO==.png)

点击右上角的“Sign up”按钮进入注册界面

![](https://vip.123pan.cn/1816365004/ymjew503t0m000d7w32xwj82f6qscvswDIYPAqDzAIaOAcxvDdawDO==.png)

填写用户名、邮箱和密码，点击“Create account”按钮，然后按照教程一步一步创建账户，完成注册。

![](https://vip.123pan.cn/1816365004/ymjew503t0l000d7w32xeuw6wnb6b6aeDIYPAqDzAIaOAcxvDdawDO==.png)

当进入此界面时，恭喜你，注册成功了。此时点击右上角的头像，再点击Profile，就可以进入你的个人主页了。

![](https://vip.123pan.cn/1816365004/ymjew503t0l000d7w32xeuw7dvb6caw9DIYPAqDzAIaOAcxvDdawDO==.png)

## 配置个人资料

配置个人资料可不是仅仅填写头像下面那个简介而已，作为优秀的“码农”，我们还需有自己的个性化介绍

- 点击repositories，查看自己的仓库
- 点击NEW，创建新的仓库
- 这个仓库的名称需要与你注册账户时的账单名称一致，比如我叫Frees-Ling，那么我创建的仓库名称也必须是Frees-Ling
- 完成后点击创建，如下图
  ![](https://vip.123pan.cn/1816365004/ymjew503t0n000d7w32ybvlnh66fekbnDIYPAqDzAIaOAcxvDdawDO==.png)
> 注意：这里我已经配置好了我的个人简介，所以你看到的界面会有所不同

将你的个人简介写在README.md文件中，点击Commit new file，完成创建,你就可以在你的主页看到你的个人介绍了！

### __恭喜你！Github入门了__

# GitHub基本用法&团队协作
## 一、项目初始化与克隆
- 本地初始化（可选）
```bash
git init
```
- 从远程仓库克隆
```bash
git clone https://github.com/FURS-community/furs-community.github.io.git
# 仅作示例！！！！！请勿克隆此仓库
```
## 二、日常开发流程（本地操作）
- 新建功能分支
```bash
git checkout -b main
```
- 查看状态
```bash
git status
```
- 添加文件到暂存区
```bash
git add filename
git add .
```
注意：空文件夹并不会被git跟踪
- 提交变更
```bash
 git commit -m "feat: describe"
```
- 推送到远程
```bash
git push origin main
```
## 三、协作开发，自动合并
- 切换主分支并拉取到最新代码
```bash
git checkout main
git pull origin main
```
- 合并到主分支
```bash
git merge main
```
### 注意：如果出现冲突
- - 使用VC code解决（其他也可以）
- - 冲突解决后
```bash
git add .
git commit
```
- 推送合并后的主分支
```bash
git push origin main
```
## 四、清理工作
- 删除合并后的功能分支
```bash
#本地
git branch -d feat/describe
#远程
git push origin --delete main
```
## 五、补充
- 查看分支
```bash
#本地
git branch
#远程
git branch -r
```
- 删除文件跟踪（保留本地）
```bash
git rm --cached filename
```
---
## 后续提交方法（上述初始工作已完成）
```bash
git add .
git commit -m "deacribe"
git push origin main
```
### 注意：每次提交之后在群里说明


# 使用 SSH 连接 GitHub 仓库
本文档总结了从本地配置到远程连接 GitHub 仓库的完整 SSH 方法。

先导：GitHub中创建自己的SSH密钥
- 点击右上角头像 → Settings → SSH and GPG keys → New SSH key
- 填写 Title，粘贴公钥内容，点击 Add SSH key 保存
- （公钥内容可通过 `cat ~/.ssh/id_rsa.pub` 查看）

### 1\. 检查是否已有 SSH Key
```bash
ls -al ~/.ssh
```
如果已经存在 `id_rsa` 和 `id_rsa.pub`，则可以跳过生成步骤。

---

### 2\. 生成新的 SSH Key
```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```
- 按提示输入保存路径（默认即可：`~/.ssh/id_rsa`）。
- 可以设置密码，也可以直接回车跳过。

---

### 3\. 启动 SSH Agent 并添加密钥
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa
```

---

### 4\. 将公钥添加到 GitHub
```bash
cat ~/.ssh/id_rsa.pub
```
复制输出内容，进入 GitHub → Settings → SSH and GPG keys → New SSH key，粘贴并保存。

---

### 5\. 测试连接
```bash
ssh -T git@github.com
```
若提示：
```
Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```
说明配置成功。

---

### 6\. 配置远程仓库地址
```bash
git init
git remote add origin git@github.com:username/repo.git
git remote -v
```

---

### 7\. 修改默认 SSH 端口（可选）
由于本地使用默认的连接端口极其容易发生断开连接，GitHub同时也针对这个推出了走 443 端口的 SSH 服务。

如果需要将默认 22 端口改为 443，可编辑 SSH 配置：
```bash
nano ~/.ssh/config
```
添加以下内容：
```
Host github.com
  HostName ssh.github.com
  User git
  Port 443
  IdentityFile ~/.ssh/id_rsa
```
保存退出后，即可通过 `ssh -T git@github.com` 走 443 端口连接。

---

### 8\. 提交与推送
```bash
git add .
git commit -m "first commit"
git push -u origin master
```

---

✅ 至此，本地即可通过 SSH 安全连接到 GitHub 并管理远程仓库。

# Github Code Spaces 使用指南
GitHub Codespaces 是 GitHub 提供的一种基于云的开发环境，允许开发者在浏览器中直接编写、运行和调试代码。以下是使用 GitHub Codespaces 的详细指南：  
## 1. 创建 Codespace
1. 登录到你的 ```GitHub``` 账号。
2. 进入你想要使用的仓库页面。
3. 点击页面右上角的绿色```Code```按钮。
4. 在下拉菜单中选择```Open with Codespaces```。
5. 点击```New codespace```按钮，```GitHub``` 会自动为你创建一个新的 ```Codespace```。
## 2. 配置 Codespace
1. 创建完成后，`Codespace` 会在浏览器中打开一个新的窗口。
2. 你可以选择不同的开发环境（如 Node.js、Python、Java 等）来配置你的 Codespace。
3. 你还可以通过编辑 `.devcontainer/devcontainer.json` 文件来自定义开发环境。
## 3. 使用 Codespace
1. 在 `Codespace` 中，你可以像在本地开发环境中一样编写代码。
2. 你可以使用内置的终端来运行命令行操作。
3. 你可以安装扩展来增强你的开发体验。
4. 你可以使用 `Git` 来管理你的代码版本。
## 4. 保存和关闭 Codespace
1. `Codespace` 会自动保存你的更改。
2. 当你完成工作后，可以点击右上角的`Codespaces`按钮，然后选择`Stop codespace`来关闭它。
3. 你可以随时重新打开你的 `Codespace`，所有的更改都会被保留。
## 5. 删除 Codespace
1. 如果你不再需要某个 `Codespace`，可以点击`Codespaces`按钮。
2. 找到你想要删除的 `Codespace`，点击旁边的“...”按钮。
3. 选择`Delete codespace`来删除它。
## 6. 注意事项
- `Codespaces` 可能会产生费用，具体取决于你的使用时间和资源消耗。
- 确保你了解 `GitHub` 的 `Codespaces` 定价政策，以避免意外费用。
- `Codespaces` 适合短期项目和快速原型开发，对于长期项目，建议使用本地开发环境。

> 你也可以使用VScode网页版本直接登录GitHub账户，选择存储库进行编辑，如需要终端测试，请点击终端，直接自动生成Github Code Spaces终端

> 当然不用担心费用问题，GitHub Code Spaces提供了免费额度，足够我们日常使用

# 探索Github有意思的存储库
这里没啥好说的，主页进去就可以看。。。但是在搜索的时候一定要 __关闭网页自动翻译__ !

#### __Author: Frees Ling__