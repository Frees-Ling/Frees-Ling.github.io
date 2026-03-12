---
title: 在Ubuntu上的另类代码编写
published: 2026-03-12
description: '本文在VScode上使用Remote SSH插件在Ubuntu上进行代码编写，适用于需要远程开发的用户。'
image: ''
tags: [Ubuntu，VScode，Remote SSH]
category: ''
draft: false 
lang: ''
---
# 前言
笔者常常苦于虚拟机的延迟，每次在终端输入输出都特别的慢，导致开发效率极低，甚至有时候会崩溃，所以就想到了一个办法，就是在本地使用VScode的Remote SSH插件，在Ubuntu上进行代码编写，这样就可以避免虚拟机的延迟问题了。
# 方法
在Ubuntu上安装SSH服务
```bash
sudo apt update
sudo apt install openssh-server
```
安装完成后，启动SSH服务
```bash
sudo systemctl start ssh
sudo systemctl enable ssh
```
确认SSH服务已经启动
```bash
sudo systemctl status ssh
```
在本地VScode上安装Remote SSH插件<br>
打开VScode，点击左侧的扩展图标，搜索Remote SSH，安装完成后，点击左下角的绿色图标，选择Remote-SSH: Connect to Host

找到虚拟机 IP，在ubuntu终端输入以下命令获取IP地址
```bash
ip a
```
在VScode中
```bash
Ctrl + Shift + P
```
输入
```angular2html
Remote-SSH: Connect to Host
```
输入
```bash
Remote-SSH: Connect to Host
```
输入
```bash
username@ip
```
> 例如
> ```bash
> fl@192.168.159.128
> ```

后面就可以在windows上使用VScode进行代码编写了，所有的操作都是在Ubuntu上进行的，VScode只是一个远程连接工具，所有的代码都会保存在Ubuntu上，这样就可以避免虚拟机的延迟问题了。