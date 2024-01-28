---
layout: post
title: SOLID设计原则系列之--接口隔离原则
category: framework
tags: [framework]
description: 接口隔离原则是什么？怎么使用接口隔离原则？
keywords: 软件设计原则, ISP原则, Interface segregation principle, java 设计原则
excerpt: 接口隔离原则是什么？怎么使用接口隔离原则？
---

你好，我是Weiki，欢迎来到猿java。

通过前面的文章，SRP限制一个类的变化来源应该是单一的；OCP要求不要随意修改一个类；LSP则规范了类的继承关系。那么接口隔离原则会给我们带来什么惊喜呢？ 今天我们就来聊一聊。


## 什么是接口隔离原则

接口隔离原则，英文为：Interface segregation principle， 简称：ISP。 在java中，我们一直都强调要面向接口编程，足以看出接口在java中的重要性。其实，
与单一职责原则类似，接口隔离原则的目标是通过将软件拆分为多个独立的部分来减少所需更改的副作用和频率。

接下来就看看作者 Robert C. Martin 对接口隔离原则是怎么定义的：

> Clients should not be forced to depend upon interfaces that they do not use.
>
> 不应强迫客户依赖他们不使用的接口。

不应强迫，这不是很明显的事情吗？ 顾客是上帝，我们怎么能强迫上帝干不喜欢干的事情呢？

或许是我们误解了"不应强迫"？它会不会有其他含义呢？ 通常来讲"不应强迫" 有2种理解：

1. 第一种理解是用户不能被强迫使用整个接口。
2. 第二种理解是用户只使用接口中的部分方法，其余的方法不能被强迫使用。

显然，第二种理解比较合理，所以接口隔离原则可以更直白一点的表达成：在接口中，不要放置接口使用者不需要的方法。

站在接口使用者的角度，这样的设计更加人性化，为什么要增加一些我不需要的依赖负担呢？

## 如何实现接口隔离原则

首先，让我们来看一个反例，假如有一个交通工具的Transportation类，类中包含设置价格，颜色，以及启停等行为方法：

```java
public interface Transportation{
    void setPrice(double price);
    void setColor(String color);
    void start();
    void stop();
    void fly();
}
```

汽车属于一种交通工具，因此我们可以定义一个Car类
```java
public class Car implements Transportation {
    double price;
    String color;
    @Override
    public void setPrice(double price) {
        this.price = price;
    }
    @Override
    public void setColor(String color) {
        this.color=color;
    }
    @Override
    public void start(){
        // implement start logic here
    }
    @Override
    public void stop(){
        // implement stop logic here
    }
    @Override
    public void fly(){
        // implement fly logic here
    }
}
```

正如在上面代码的实现可以看出，Car不能飞行却要实现 fly() 方法，为什么？ 显然fly()这个方法是Car这种交通工具不需要关注，这就违反了接口隔离原则。

如何解决这个问题呢？

解决方案：将交通工具接口分成多个角色接口，每个角色接口用于特定的行为。在这里我们可以分成 BasicFeature、 Movable、Flyable 三类行为接口。

```java
// 基本属性， 价格，颜色
public interface BasicFeature{
    void setPrice(double price);
    void setColor(String color);
}
```

```java
// Movable 行为， 行驶和停止
public interface Movable {
    void start();
    void stop();
}
```


```java
// 飞行 行为
public interface Flyable {
    void fly();
}
```

Car只关注基本属性和Movable 行为，
```java
public class Car implements BasicFeature, Movable {
    private double price;
    private String color;
    
    @Override
    public void setPrice(double price) {
        this.price = price;
    }
    @Override
    public void setColor(String color) {
        this.color=color;
    }
    @Override
    public void start(){
        // Implementation
    }
    @Override
    public void stop(){
        // Implementation
    }
}
```
Airplane 飞机关注 基本属性和Movable行为和飞行行为

```java
public class Airplane implements BasicCFeature, Movable, Flyable {
    private double price;
    private String color;
    
    @Override
    public void setPrice(double price) {
        this.price = price;
    }
    @Override
    public void setColor(String color) {
        this.color=color;
    }
    @Override
    public void start(){
        // Implementation start logic
    }
    @Override
    public void stop(){
        // Implementation stop logic
    }
    @Override
    public void fly(){
        // Implementation fly logic
    }
}
```
通过上面的拆解，我们可以看到每种交通工具只需要关注自己需要的接口就好了，自己不需要的接口就不会被强迫关注，更加不会造成Car能fly()这样的误解。


## 总结

接口隔离原则要求在接口中，不要放置接口使用者不需要的方法。

做接口设计时，需要关注不同的使用者，不能只关注设计者。

大而全的接口不一定是好接口。


## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

