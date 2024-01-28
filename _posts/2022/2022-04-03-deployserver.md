---
layout: post
title: 如何把技术博客部署到自己的服务器
category: common
tags: [common]
excerpt: 有了技术博客，如何才能被百度收录，希望被更多的技术人看到呢？
---

你好，我是Weiki，欢迎来到猿java。

上篇博客我们分享了如何使用GitHub Pages+Jekyll搭建免费的技术博客网站，但是上篇也介绍过毕竟是免费的，因此使用也会受到一定的制约，最重要是如果不能被百度收录，那就更糟糕，因此今天我们就来分享下如果把自己的博客迁移到自己的服务器上。
> 温馨提示：在进行今天的实操之前你得具备：1个已经备案的域名 + 1台云服务器

没有备案域名的可以参考：[如何搭建自己免费的技术博客](https://www.yuanjava.cn/common/2022/03/21/domain.html)

没有云服务器的可以参考：[如何购买云服务器](https://www.yuanjava.cn/common/2022/03/22/buyserver.html)

## 前置安装

安装jekyll可能需要依赖下面的前置环境，如果在安装的过程中少啥装啥

```shell
yum install zlib
yum -y update gcc
yum -y install gcc+ gcc-c++
```

## 安装ruby

Jekyll依赖于Ruby环境，需要安装Ruby，我是源码安装的ruby-2.5.9版本，操作指令如下，如果中间安装出现什么问题，可以自省网上找下具体的解决方案
```shell
cd /usr/local
mkdir ruby
cd ruby
wget https://cache.ruby-lang.org/pub/ruby/2.5/ruby-2.5.9.tar.gz
tar zxvf ruby-2.5.9.tar.gz
cd ruby-2.5.9/
./configure --prefix=/usr/local/ruby
make && make install

#安装成功后查看版本
ruby -v
ruby 2.5.9p229 (2021-04-05 revision 67939) [x86_64-linux]

# ruby的 环境变量设置
vim ~/.bash_profile

#在.bash_profile 文件中将原来的PATH=修改为以下内容
PATH=/usr/local/ruby/bin:$PATH:$HOME/bin

# 生效修改后的环境变量
source ~/.bash_profile

```


## **安装Jekyll**

```shell
gem install jekyll

# 安装成功后查看版本
[root@yuanjava ~]# jekyll -v
jekyll 4.2.2

# 因为博客需要用到sitemap和paginate插件
gem install jekyll-sitemap
gem install jekyll-paginate

```


## 安装Jekyll中遇到的问题

**问题1**

```shell
make: *** No rule to make target `/include/ruby.h', needed by `zlib.o'.  Stop.
```
**解决办法**
找到ruby源码目录   cd /usr/local/ruby/ruby-2.5.9/，打开ext/zlib/Makefile文件，找到下面一行：

```shell
zlib.o: $(top_srcdir)/include/ruby.h
改成：
zlib.o: ../../include/ruby.h
```



## **部署博客**

执行下面的代码，就可以把服务run起来
```shell
cd /usr/local/
# 创建目录，该目录可以修改成你自己想要的
mkdir yuanjava
cd yuanjava
# 如果操作提示 git 指令不存在，则安装  yum install git
git clone https://github.com/yuanjavar/yuanjavar-yuanjava.github.io.git

# 进入源码
cd yuanjava.github.io

jekyll serv

```

OK，到此，我们服务就已经部署好了并且也run起来了，但是要怎么访问呢？

## 安装nginx
nginx 是一个反向代理的工具，可以接受外部请求，把请求转发到具体的服务上去
```shell
# yum 安装 nginx
yum install nginx

# 查看版本
nginx -v
# nginx version: nginx/1.20.1

# 启动nginx
nginx

# 查看进程
ps -ef|grep nginx

#进程信息如下
[root@yuanjava yuanjava.github.io]# ps -ef|grep nginx
root      1779     1  0 Apr16 ?        00:00:00 nginx: master process nginx
nginx     1780  1779  0 Apr16 ?        00:00:00 nginx: worker process
nginx     1781  1779  0 Apr16 ?        00:00:00 nginx: worker process
root     15586 15463  0 16:08 pts/1    00:00:00 grep --color=auto nginx
```

查看nginx安装后的配置文件：cat /etc/nginx/nginx.conf，如下图，通过配置可以知道默认监听了80(http)和443(https)两个端口，根据我们的域名是http还是https还看具体的目录

![img.png](https://www.yuanjava.cn/assets/md/deployserver/img_3.png)

## 将博客部署到nginx中
默认安装的nginx，访问时的指向 /usr/share/nginx/html，我们只要把博客编译成html，然后放到该目录下就可以ip地址访问了

```shell

# 进入源码
cd /usr/local/yuanjava/yuanjava.github.io

# 更新master最新代码，如果你写了新博文发到master，没有更新的话可以跳过这一步
git pull origin master

#在源码目录下
jekyll build --destination=/usr/share/nginx/html
```

也可以把上面的几个步骤写了一个 deploy.sh 脚本中，后面只需要执行shell脚本了  sh deploy.sh 

## 域名解析

到域名服务商，将域名解析指向服务器ip就可以了，比如我的是阿里云的域名，[域名解析地址](https://dc.console.aliyun.com/next/index?spm=5176.12818093.ProductAndService--ali--widget-home-product-recent.dre2.449616d0kmjY5n#/domain-list/all)

![img.png](https://www.yuanjava.cn/assets/md/deployserver/img_1.png)

![img.png](https://www.yuanjava.cn/assets/md/deployserver/img_2.png)

## 访问域名

在浏览器中输入你的域名，接下来就是见证奇迹的时刻了...

![img.png](https://www.yuanjava.cn/assets/md/deployserver/img.png)


##小知识

一般linux安装有多种方式，比较常见有：云安装和源码安装

**1.云安装**  

该方式是云端拉取资源安装，比较省事，一般都是安装该系统支持的最新包
```shell
yum install 软件名称  // 针对linux系统
yum install 软件名称 -v '版本号' //指定版本安装 
apt-get install 软件名称  // 针对ubuntu系统
```



**2.源码安装**

该方式需要我们去下载包，然后解压，编译，安装，相对 yum 比较麻烦一点，整体流程如下：
```shell
wget https://xxxx.tar
tar zxvf xxxx.tar
cd xxxx
./configure --prefix=目录 //指定目录安装
make & make install
```

到此，我们的部署分享就结束了，建议大家有条件的一定实操下哦！


## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
