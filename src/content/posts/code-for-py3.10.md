---
title: Python3.10另类常用安装方法
published: 2026-03-07
description: '本文主要讲述了Python3.10的另类安装方法，适用于Ubuntu系统，主要通过源码编译安装，适合需要特定版本Python的用户。'
image: ''
tags: [随笔，Python]
category: 'Note'
draft: false 
lang: ''
---
# 前言
对于一般计算机而言，我们安装python的方式有很多种，但是如果对于虚拟机，或者是开发板这类，网络不一定好用，所以这里，我将介绍另一类常用的安装方法——源码编译安装
> 注意：本文所用系统Ubuntu20.04.x LTS
# 编译所需要的工具链
```bash
sudo apt update
sudo apt install -y build-essential zlib1g-dev libncurses5-dev libgdbm-dev \
libnss3-dev libssl-dev libreadline-dev libffi-dev libsqlite3-dev wget libbz2-dev
```
# 下载Python3.10源码
```bash
cd /tmp
wget https://www.python.org/ftp/python/3.10.14/Python-3.10.14.tgz
tar -xvf Python-3.10.14.tgz
cd Python-3.10.14
```
# 编译安装
```bash
./configure --enable-optimizations
make -j$(nproc)
sudo make altinstall
```
安装完后验证一下`python3.10 --version`
这样就已经装好了吗？
不
并没有。。。。。。。
# PIP安装
刚刚编译出来的仅仅是Python本体，还没有任何东西，接下来将进行介绍
```bash
python3.10 -m ensurepip --upgrade

#安装完确认一下
python3.10 -m pip --version

#有如下输出证明完成
pip 23.x from ... (python 3.10)
```
# 选修：另类高效常用包管理器——UV
> 在这里声明，笔者一直都十分看好一门后端语言，那就是Rust，我欣赏它干净，快速和安全，所以UV包正是在Rust之下产出的一种非常高效，几乎是秒杀pip级别的存在（pip的慢和冗杂一直被诟病）
## 第一种安装方法
通过系统级来安装
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh

#测试
uv --version
```
## 第二种安装方法
通过Python3.10自行安装
```bash
python3.10 -m pip install uv
```
但是安装完之后进行测试，发现并没有`uv`包，为什么呢？
`Ubuntu`会把下载的第三方库放在这里`~/.local/bin/uv`
```bash
#先验证一下
ls ~/.local/bin

#输出
fl@fl-virtual-machine:~/桌面/Test/YOLO$ ls ~/.local/bin
pip  pip3  pip3.10  uv  uvx
```
我们会发现有UV在里面，哎呀，原来没有写进系统里，所以找不到
```bash
#加入系统目录
echo 'export PATH=$HOME/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```
这样就可以正常使用uv了