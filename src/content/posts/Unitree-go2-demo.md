---
title: Unitree Go2 基础开发演示及配置
published: 2026-01-09
description: 'Unitree Go2'
image: 'https://vip.123pan.cn/1816365004/yk6baz03t0n000d7w33hq3gy1ogyqw1gDIYPAqDzAIaOAcxvDdawDO==.webp'
tags: ['Unitree Go2', '机器人', '开发演示']
category: 'Develop Log'
draft: false 
lang: ''
---
# Unitree Go2 基础开发演示及其配置
## Author: Frees Ling
本文介绍了如何进行Unitree Go2 EDU型号进行二次开发的基础演示以及配置方法<br>
__仅限实现Hello world DEMO程序测试运行__
> 注意：本文档仅限于在Unitree Go2 EDU上机载主机进行二次开发使用，如有其他方法，请参考官方技术文档
## 一、准备工作
1. 硬件准备
   - Unitree Go2 EDU机器人
   - 电脑（Ubuntu 20及以上）
   - 一根网线连接机器人和电脑
2. 软件准备
   - 安装Ubuntu 20及以上版本
   - VS code编辑器

## 二、简要介绍
![](https://vip.123pan.cn/1816365004/ymjew503t0n000d7w32yjdvcf0fkjespDIYPAqDzAIaOAcxvDdawDO==.jpg)
如图，为Unitree Go2 的架构，这里我们可以通过ROS系统进行二次开发，数据通信到DDS数据中间件，再通过DDS传输到机器人上进行控制
> OTA：Over The Air 空中下载技术，可以通过无线网络对机器人进行远程升级<br>
> BLE：Bluetooth Low Energy 低功耗蓝牙技术<br>
> UWB：Ultra Wide Band 超宽带技术，主要用于定位<br>
> GST SDK:图像模块传输SDK<br>
> 基础服务：机器人底层控制服务和获取基础信息<br>
```markdown
部分参考文档
ROS2官网：https://www.ros.org
宇树文档中心：https://support.unitree.com/home/zh/developer
ROS2理论与实践：https://www.bilibili.com/video/BV1VB4y137ys
```
## 三、具体操作步骤
### 1. 使用网线连接机器人和电脑
将网线一端连接到机器人上的以太网口，另一端连接到电脑的以太网口，如图
![](https://vip.123pan.cn/1816365004/ymjew503t0m000d7w32y4gwkvw230ddkDIYPAqDzAIaOAcxvDdawDO==.jpg)
![](https://vip.123pan.cn/1816365004/yk6baz03t0l000d7w33g55bc5flwtn6aDIYPAqDzAIaOAcxvDdawDO==.jpg)
### 2. 配置电脑网络
打开电脑的网络设置，找到以太网口的网络配置
> IP地址为192.168.123.xxx；子网掩码为255.255.255.0

![](https://vip.123pan.cn/1816365004/yk6baz03t0n000d7w33hq3negzh5u0dnDIYPAqDzAIaOAcxvDdawDO==.png)
> 图示仅供参考，具体以实际操作界面为准
### 3. 下载克隆官方ROS2，SDK
在本地新建一个文件夹用于存储克隆代码，打开终端，进入该文件夹，执行以下命令
```bash
#Ubuntu 20
cd xxx/your_folder_path
sudo apt-get update
sudo apt-get install -y cmake g++ build-essential libyaml-app-dev libeigen3-dev libbost-all-dev libspdbg-dev libfmt-dev
#如果权限不足，可以使用sudo -i提权
```
克隆ROS2代码
```bash
#克隆默认使用SSH进行克隆
git clone git@github.com:unitreerobotics/unitree-ros2.git
```
克隆SDK代码
```bash
git clone git@github.com:unitreerobotics/unitree_sdk.git
```
### 官方教程
我没有构建编译成功估计是因为机器狗算力板上面的安全模块没有驱动成功，当然也可以自行参考官方进行编译
首先克隆仓库至本地
```bash
git clone git@github.com:unitreerobotics/unitree-ros2.git
mkdir build
cd build
cmake ..
make
```
### 4.使用VS code SSH远程连接机器人
![](https://vip.123pan.cn/1816365004/ymjew503t0n000d7w32yjgmsq9l36plcDIYPAqDzAIaOAcxvDdawDO==.png)
如上图，使用SSH远程连接机器人
```bash
username: unitree@192.168.123.18
password: 123
```
连接完成后，会显示`ros:foxy(1) noetic(2) ?`，此处请按照ubuntu系统版本选择
> Ubuntu 20请选择1，Ubuntu 22请选择2
### 5.运行Hello world DEMO程序
选择完成后，我们进入系统环境目录，进行Unitree Go2的ROS2环境进行构建<br>
此处我们将上面已有的ROS2和SDK代码拖入`cyclonedds_ws/src`目录下<br>
![](https://vip.123pan.cn/1816365004/ymjew503t0n000d7w32yjgna36l46s06DIYPAqDzAIaOAcxvDdawDO==.png)
> 注意：这里的`helloworld`文件夹可以在GitHub仓库中自行下载<br>
> `https://github.com/fcs-z/unitree_go2_ws/tree/main/src/helloworld`
## __注意⚠️：本文档只按照当前系统环境进行操作__
```bash
cd cyclonedds_ws
source install/setup.bash
```
运行完成后，我们可以通过运行`ROS2`来检查自己是否真的启动了ROS2环境
![](https://vip.123pan.cn/1816365004/yk6baz03t0n000d7w33hq98cucmma485DIYPAqDzAIaOAcxvDdawDO==.png)
__如果上面完成后，那么恭喜你，已经解决了99%的问题，还剩下最后1%的问题__<br>
---
### 编译程序
> __注意⚠️：<br>我们所有编译好的程序包都需要放在`cyclonedds_ws/src`目录下__<br>

此时我们进入`cyclonedds_ws`目录下进行编译
```bash
colcon build
```
构建编译时间需要等待，等待其完成后请运行
```bash
ros2 run go2_helloworld hello
```
这里我们提供了两种方法调用，你还可以使用python构建的模块包
```bash
ros2 run go2_helloworld_py hello
```
> 注意⚠️：如果构建失败请尝试以下方法<br>
> 在同目录下，请运行`rm -rf build install log`<br>
> 然后再重新尝试[编译程序](#编译程序)
> 
![](https://vip.123pan.cn/1816365004/yk6baz03t0n000d7w33hq99kxqmns7f3DIYPAqDzAIaOAcxvDdawDO==.jpg)
# 恭喜你，完成了Unitree Go2二次开发入门
