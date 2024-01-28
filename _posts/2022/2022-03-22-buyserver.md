---
layout: post
title: 如何购买云服务器
category: common
tags: [common]
excerpt: 假如某天公司让你选择云服务，然后部署你们的服务，你会怎么选？
---

你好，我是Weiki，欢迎来到猿java。

在[如何搭建自己免费的技术博客](https://www.yuanjava.cn/common/2022/03/28/blog.html) 这个篇博客中我为大家分享了如何利用免费的GitHub Pages+Jekyll资源搭建自己免费的技术博客，今天我就来分享一下如何为自己的博客选择一个合理的服务器。

服务器，作为后端开发的小伙伴应该不陌生，开发好的代码，需要把它部署到服务器上run起来，才能对外提供服务。那么，这个服务器你有亲自去配置过吗？你知道你们公司的服务器是什么配置吗？服务器运行过程中会遇到什么性能瓶颈吗？

市面上常见的服务器有2种：云服务器和真实的物理机

云服务器：亚马逊云(aws)、阿里云、腾讯云

物理机：规模比较大的公司，会自己搭建机房，提供物理机等服务

> 本文以阿里云服务器为例

## 1. 申请一个阿里云账号
   
[阿里云地址](https://www.aliyun.com/) ，如果没有账号，注册一个，然后登录

## 2. 登录账户

选择产品->云服务器Ecs-> 立即购买

![img.png](https://www.yuanjava.cn/assets/md/common/img.png)

![img.png](https://www.yuanjava.cn/assets/md/common/img_1.png)

## 3. 配置选择

如下图操作，选择配置的时候，需要配置一个服务的密码，等下用来登录服务器验权使用

![img.png](https://www.yuanjava.cn/assets/md/common/img_2.png)

![img.png](https://www.yuanjava.cn/assets/md/common/img_3.png)
   
   | 配置名        | 配置值           | 说明  |
   | ------------- |:-------------:| -----:|
   | 收费模式      | 包年包月/按量付费/抢占模式 | 包年包月就是每个月固定的费用，按量付费就是根据实际的使用量来扣费 |
   | 地区及可用      | -     |   选择里客户端使用者最近的地方，给海外用选择海外的，国内使用，选择你自己所在地 |
   | 实例规格 | -      |    选择几个cpu，多大的内存，根据实际需要来 |  
   | 镜像 | -      |    选择操作系统，通常选公共镜像->alibaba linux(自己熟悉的系统) |   
   | 存储 | -      |    选择什么云盘，没有特殊需求的话选择高效云盘 |   
   | 快照服务 | -      |    备份你的系统，方便后期出现问题，可以用快照恢复系统 |
   | 网络 | -      |    选默认，后期可以配置 |
   | 安全组 | -      |    选默认，后期可以配置 |

> 温馨提示：如果你是做java开发，尽量选Linux系统，不选windows，不要担心不会使用Linux，多搞几次就会了，这个是java程序猿的服务器标配，另外开发最好也要使用mac电脑这种类linux操作系统，这样的话，平时的指令操作就是在锻炼你的linux指令能力

## 4. 付款，等待ecs分配

付款成功后就有几分钟的等待时间，帮你初始化一台云服务器，然后到控制台就可以查看到了[Ecs云服务控制台](https://ecs.console.aliyun.com/?spm=5176.12818093.ProductAndService--ali--widget-home-product-recent.dre1.449616d0KWrF16#/home)，在服务台上你就可以看到自己服务的一些信息，我选购的是2c2g
包年包月，一年大概700左右，大家如果是学习使用选最便宜的就好了，公司使用的话根据具体选择，后期都是动态升降配置的。

![img.png](https://www.yuanjava.cn/assets/md/common/server.png)

## 5. 登录云服务
   
1.阿里云自己提供的终端

如图操作，账户/密码 为 root/自己购买服务器时设置的密码

![img.png](https://www.yuanjava.cn/assets/md/common/img.png)

![img.png](https://www.yuanjava.cn/assets/md/common/img_5.png)

2. 外部的终端(mac自带的terminal，zsh, 或者SecureCRT等等)

如图外SecureCRT登录的界面

![img.png](https://www.yuanjava.cn/assets/md/common/img_5.png) 

## 6. 指令操作服务

常见的指令：  

ll  ls     查看目录列表

cd  切换目录，  比如  cd /usr 表示切换到根目录的 usr目录下

其他的指令可以网上找一下，linux入门还是比较简单的


## **小建议**

购买了服务器之后，如果是学习使用的话，可以使劲的造，出了问题可以到控制台初始化一下系统，然后又能继续造，学习的过程就是一个不断试错然后成长的过程。


想购买阿里云服务器此处进入有优惠哦[阿里云ECS云服务器2折起](https://www.aliyun.com/minisite/goods?taskCode=minisiteps2204&recordId=3605116&userCode=kxg0imit&share_source=copy_link)


>
> 本文为原创文章，转载请标明出处。
> 
> 本文链接：https://www.yuanjava.cn/common/2022/03/22/buyserver.html
> 
>本文出自猿[java的博客](https://www.yuanjava.cn)

## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java