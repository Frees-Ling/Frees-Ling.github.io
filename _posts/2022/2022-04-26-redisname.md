---
layout: post
title: 用了这么多年Redis，你知道Redis名字的由来吗？
category: redis
tags: [redis]
excerpt: Redis作为内存数据库的天花板，你知道它名字的由来吗？
--- 
你好，我是Weiki，欢迎来到猿java。

## 背景
 Redis作为知内存数据库的天花板，在很多复杂的高并发，高性能项目中都可以看到，用了这么多年，一直很好奇Redis到底是什么意思，今天总有找到了

## Redis名字由来m
Redis的作者是antirez，[antirez个人官网](http://antirez.com/)，
在Redis的官方文档中有一段关于 [redis名字由来的解释](https://redis.io/docs/getting-started/faq/#redis-is-single-threaded-how-can-i-exploit-multiple-cpu--cores)
> Where does the name "Redis" come from?
> 
> Redis is an acronym that stands for REmote DIctionary Server.

REmote DIctionary Server：远程字典服务器，Redis就是这3个单词的组合

> Redis源码是C语言实现的，而字典又是C语言中一种经典的数据结构，字典的含义如下：
> 
> 字典：是由一些具有相同可辨认特性的数据元素（或记录）构成的集合

字典，这是不是和java.util.Collection 集合有异曲同工之妙呢？


## 最后
如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java

