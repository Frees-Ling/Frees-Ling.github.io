---
layout: post
title: SOLID设计原则系列之--单一职责原则
category: framework
tags: [framework]
excerpt: 在日常开发工作中，经常会听到有经验的技术念叨要注意接口的单一职责，很多初级程序员甚至工作了好多年的程序员都会简单的把它理解成一个类就干一件事，那么事实真的是这样吗？
---
你好，我是Weiki，欢迎来到猿java。

在日常开发工作中，经常会听到有经验的技术念叨要注意接口的单一职责，很多初级程序员甚至工作了好多年的程序员都会简单的把它理解成一个类就干一件事，那么事实真的是这样吗？今天就让我们来聊聊单一职责到底是什么。




## 单一职责原则

单一职责原则，英文是：Single responsibility principle，简称：SRP。这个名字非常容易让我们望文生义，理解成一个类只干一件事。既然 SOLID 原则是由 Robert C. Martin 提出和完善的，那么可以先看看 [作者对单一职责原则的描述](http://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)，这里摘取了作者关于单一职责的原文：

```text
The Single Responsibility Principle (SRP) states that each software module should have one and only one reason to change. 
```
原文翻译为：单一职责原则 (SRP) 指出，任何一个软件模块都应该有一个且只有一个修改的理由。

但是，软件设计是一门关注长期变化的学问，变化是软件中经常遇到的问题，在现实环境中，软件系统为了满足用户和所有者的要求，势必会作出各种修改，而系统的用户或者所有者就是该设计原则所指的"被修改的原因"。
因此单一职责被作者重新描述为：
```text
The single responsibility principle states that every module or class should have responsibility over a single part of the functionality provided by the software, and that responsibility should be entirely encapsulated by the class. All its services should be narrowly aligned with that responsibility.
```
原文翻译为：任何一个软件模块都应该只对一个用户或者系统利益相关者负责。

该定义中提及了 用户、系统利益者，那么是一个还是多个用户和利益相关者呢？是不是只要希望对系统进行修改的都可以统一为行为者，因此单一职责最终被作者描述为：
```text
Each module should only be responsible to one actor.
```
原文翻译为：任何一个软件模块都应该只对某一类行为者负责

## 软件模块
上文一直提及的"软件模块"到底是什么呢？大部分情况下，其简单的定义就是指一个源代码文件，比如java中的类，接口， 方法等，也可以是一组紧密相关的函数和数据结构。

## 反例

任何一个软件模块都应该只对某一类行为者负责，怎么理解呢？我们来看一个例子：

假如设计一个Employee员工类并且包含3个方法：
```java
public class Employee {
  public Money calculatePay();
  public void save();
  public void postEvent();
  // calculatePay() 实现计算员工薪酬
  // save() 将Employee对象管理的数据存储到企业数据库中
  // postEvent() 用于促销活动发布
}
```

刚看上去，这个类设计得还挺符合实际业务，员工有计算薪酬、保存数据、发布促销等行为，但是这3个方法对应三类不同的行为者，违反了单一职责原则。Employee类将三类行为耦合在一起，假如一个普通员工不小心调用了calculatePay()方法，把每个员工的薪酬计算成了实际工资的2位，那可想而知这是一个灾难性的问题。
另外，加入没过多久，新的需求来了，要求员工能够导出报表，于是得增加了一个新的方法，

```java
void exportReport();
```
接着需求又一个一个的过来，Employee类就得一次一次的变动，这会导致什么结果呢？
一方面，Employee类会不断的膨胀； 另一方面，内部的实现会越来越复杂。需求完全不同，但是却要改动同一个类，合理吗？

想想你的工作是否也有这样的设计，把很多不同行为都耦合到一个类中，然后随着业务的增加，该类急剧膨胀，最后无法维护。

## 解决方案

我们可以有很多不同的方法来解决上述的问题，特定的行为只能由特定的行为者来操作，因此我们可以把Employee拆解成3类行为者，将因相同原因而发生变化的事物聚集在一起，将那些因不同原因而改变的事物分开。这就行为就是定义内聚和耦合的一种方式：增加因相同原因而变化的事物之间的内聚，减少因不同原因而变化的事物之间的耦合。

```java
public class FinanceStaff {
  public Money calculatePay();
}

public class TechnicalStaff {
    public void save();
}

public class OperatorStaff {
    public String postEvent();
}

```


## 总结

- 单一职责原则本质上就是要理解分离关注点。
- 单一职责原则可以应用于不同的层次，小到一个函数，大到一个系统，我们都可以用它来衡量我们的设计。
- 从Robert C. Martin对单一职责描述的变更也可以看出，软件设计也不可能一成不变。

映射到实际的工作经验，我们可以把一个系统模块作为一个单一职责，比如：订单系统只关注订单相关的行为，交易系统只关注交易相关的行为；
我们可以把类作为一个单一职责，比如： 订单类，把订单相关的CRUD聚合在一起。

## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

