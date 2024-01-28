---
layout: post
title: DynamoDB系列之--几个核心的概念
category: DynamoDB
tags: [DynamoDB]
excerpt: DynamoDB作为亚马逊重磅推出的NoSql数据库，在亚马逊去Oracle数据库之后也开始在使用自家的DynamoDB，那么DynamoDB 有哪些核心的概念呢？
---
你好，我是Weiki，欢迎来到猿java。

DynamoDB作为亚马逊重磅推出的NoSql数据库，在亚马逊去Oracle数据库之后也开始在使用自家的DynamoDB，那么DynamoDB 有哪些核心的概念呢？今天我们就来一起聊聊

在讲概念之前，我们先来看一张DynamoDB的table的截图，是不是和Mysql这种关系数据库的表很相似

![img.png](https://www.yuanjava.cn/assets/md/java/dynamodb-table.png)

## DynamoDB核心概念

1. tables, items, and attributes;
2. primary keys;
3. secondary indexes;
4. read and write capacity.


## Tables、Items、Attributes

Tables, Items, Attributes是DynamoDB的核心组成模块。

Tables：表， 存放一组数据记录，比如Users表来存储用户的信息，类同于关系数据库中的表或 MongoDB 中的集合。

Items：行，表中的单个数据记录。类同于关系数据库中的行或 MongoDB 中的文档。

Attributes：属性，每个项目中的的字段。类同于关系数据库中的列或 MongoDB 中的字段。

## Primary keys

Primary keys：主键，用来唯一标识表中的每一行数据(Item)，类同于mysql等关系数据库中的主键，DynamoDB的主键在创建表时是必须要设置的，DynamoDB中的主键有两种类型：简单主键和复合主键。

如下图：仅设置了用于分区的 Partition key为简单主键，分区的 Partition key 和 排序的Sort key 同时设置时为复合主键。 不管是使用简单的主键还是复合主键，都能唯一标识DynamoDB表中的一个Item。

![img.png](https://www.yuanjava.cn/assets/md/java/dynamodb-primary-key.png)

## Secondary indexes

Secondary Indexes：二级索引

有使用过mysql关系型数据库的小伙伴一定知道，在Mysql中主键可以唯一标识一条记录，但是有时候我们不仅仅是依赖主键进行查询，比如，在订单表中，除了可以通过主键订单id来查询，我们还希望通过用户id来查询订单；类同，在DynamoDB中把主键以外的索引都称为二级索引，二级索引有本地二级索引和全局二级索引两种类型。
下面为table索引的一张截图：

![img.png](https://www.yuanjava.cn/assets/md/java/dynamodb-index.png)

### local secondary indexes

本地二级索引使用与基础表相同的分区键(Partition key)，但使用不同的排序键(Sort key)。 以Order表为例，假设希望按照客户订单金额的降序快速访问客户的订单。 您可以添加分区键为CustomerId和排序键为Amount的本地二级索引，从而可以按金额高效查询客户的订单。

### global secondary indexes
全局二级索引允许对不属于表主键的属性执行查询。 请注意，全局二级索引读写容量设置与表的设置是分开的，它们会产生额外的成本。


## Read and Write Capacity

Read and Write Capacity：读写容量

在使用MySQL, Postgres, or MongoDB数据库时，当我们需要多个服务器时，就需要设置cpu，内存，硬盘容量等信息，但是使用DynamoDB时，就无需关注这些，只需要配置读取和写入容量单位。 这些单位允许每秒进行给定数量的操作。 同时，DynamoDB 还可以自动扩容读写容量单位。 方便高峰时段动态扩展应用服务。


## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

