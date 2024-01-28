---
layout: post
title: 如何免费将http升级成https？
category: java
tags: [java]
excerpt: 如果你的域名是http，在访问网站时，总是会有个烦人的警告"不安全"，严重影响网站的信誉度，本博文将分享如何免费将http升级成https
---
你好，我是Weiki，欢迎来到猿java。

如果你的域名是http，在访问网站时，总是会有个烦人的警告"不安全"，严重影响网站的信誉度，今天我们就来聊聊将分享如何免费将http升级成https

> 申明：本博文是基于阿里云的ssl

## 申请ssl证书

在 [ssl证书申请传送门](https://yundun.console.aliyun.com/?spm=5176.12818093.ProductAndResource--ali--widget-product-recent.dre10.347316d0EI4wNO&p=cas#/certExtend/free) 这本经典的书籍中有一套关于软件设计的SOLID原则，SOLID 实际上是五个设计原则首字母的缩写，它们分别是：

![img.png](https://www.yuanjava.cn/assets/md/java/ssl-men.png)

购买证书的时候可以绑定你的域名，然后点击验证， 成功后，阿里云服务器会给你的域名自动添加一条解析记录
![img.png](https://www.yuanjava.cn/assets/md/java/yu.png)

## 下载证书
> 本文以nginx为例，其他服务器的可以参考阿里云对应的文档

![img.png](https://www.yuanjava.cn/assets/md/java/download-cert.png) 
![img.png](https://www.yuanjava.cn/assets/md/java/download-cert2.png)

下载是一个压缩包，压缩包里面有两个文件：xxx.pem, xxx.key


## 上传证书

登录云服务器，进入Nginx的安装目录，比如我的安装目录为 /etc/nginx.

新建一个cert目录用于存放刚才下载的证书
```shell
cd /etc/nginx
mkdir cert
```
将证书上传到/etc/nginx/cert 目录下

修改 nginx.conf文件
```text
server {
    listen 443;
    # 你的域名
    server_name your-domain.com; 
    ssl on;
    root /var/www/html; 
    index index.html index.htm;
    # 你的证书的名字
    ssl_certificate  /etc/nginx/cert/xxx.pem; 
    #你的证书的名字
    ssl_certificate_key /etc/nginx/cert/xxx.key;
    ssl_session_timeout 5m;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_prefer_server_ciphers on;
    location / {
        index index.html index.htm;
    }
  }
server {
    listen 80;
    # 你的域名
    server_name your-domain.com;
    # 把http的域名请求转成https
    rewrite ^(.*)$ https://$host$1 permanent;
}

```

验证nginx配置是否有误
```shell
nginx -t 
```

返回以下内容代表 nginx.conf 文件无误
```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

重新启动nginx
```shell
nginx -s reload
```

ok，所有的配置完成，接下来就是见证奇迹的时候，浏览器输入域名，点击enter，域名前面加锁了代表https生效

![img.png](https://www.yuanjava.cn/assets/md/java/https.png)



注意：免费的ssl证书有效期是1年，如果需要长期维护的域名，记得每年更换证书哦

## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

