---
layout: post
title: SOLID设计原则系列之--依赖倒置原则
category: framework
tags: [framework]
description: 依赖倒置原则是什么？怎么依赖倒置原则？
keywords: 软件设计原则, DIP原则, Dependency inversion principle, java设计原则
excerpt: 依赖倒置原则是什么？怎么使用依赖倒置原则？
---

你好，我是Weiki，欢迎来到猿java。

前面讲述了SOLID中的前4种设计原则，也列举了实际工作中的一些真实代码示例，今天我们将分析最后一种原则：依赖倒置。

## 什么是依赖倒置原则

依赖倒置原则，英文为：Dependency inversion principle， 简称：DIP。 

依赖，顾名思义，就是A代码里面使用了B，A就依赖B，这个是我们最能理解的方式。 倒置，莫非是A依赖B，要转成B依赖A？

接下来就看看作者 Robert C. Martin 对接口依赖倒置原则是怎么定义的：

> The Dependency Inversion Principle (DIP) states that high-level modules should not depend on low-level modules; both should depend on abstractions. Abstractions should not depend on details. Details should depend upon abstractions.
>
> 依赖倒置原则（DIP）指出高层模块不应该依赖低层模块； 两者都应该依赖于抽象。 抽象不应该依赖于细节。 细节应该取决于抽象。


高层模块不应该依赖低层模块；抽象不应该依赖于细节；如何理解呢？ 先看几个示例，帮助我们理解

## 如何实现依赖倒置原则

**高层依赖低层的反例**：实现一个通知系统，当用户账户余额不足时通知用户充值，通知的方式有邮箱，短信等，最常规的实现如下：

```java
public class Notification{
    
    public void notify(String type){
        if ("email".equals(type)){
            // email notify logic
            
        }else if("sms".equals(type)){
            // sms notify logic
            
        }else if("xxx".equals(type)){
            //
        }
    }
}
```
该代码违背了高层依赖于低层，每次低层的实现变更，高层都需要关注，同时该代码也违背了开闭原则。

如何解决？

> 在计算机领域有个经典的理论：可以通过引入一个中间层来解决依赖。

因此上面的问题，我们可以增加一个中间层，比如：消息中间件

```java
public class Notification{
    
    public void notify(Msg msg){
        // 将消息发送给mq
        sendMq(msg);
    }
}

// 邮件通知
public class EmailNotification{

    public void receiveMq(Msg msg){
        // email notify logic
        
    }
}

// 短信通知
public class SmsNotification{

    public void receiveMq(Msg msg){
        // Sms notify logic

    }
}
```
通过引入中间层，高层只需要把信息发送给消息中间件，再也不用依赖于下面的通知实现细节。

**抽象依赖实现的反例**
在实际开发中，如果使用dubbo框架实现服务之间的rpc调用，假如订单系统需要从用户系统获取用户的信息。

通常的做法是：订单系统会依赖用户系统的API，然后通过API调用用户系统，代码实现如下：

```java
public class Order{
    // UserService 和 User 都是用户系统 API 依赖提供的
    UserService userService;
    public Order(UserService userService){
        this.userService = userService;
    }
    public User getUserIdInfo(){
        // 抽象的rpc接口调用
        User user = userService.getUserInfo(userId);
    }
}
```

这段代码看起来没有毛病，假如用户系统API升级了(User类中的name改成了username)，如果订单系统需要升级用户系统API，那么只要订单系统里面使用到User name的地方，都要修改成username，这个入侵太可怕。
本来订单系统只是一个抽象的接口调用用户系统，但是因为直接依赖了结果值里面的字段，导致用户实现细节的变更直接影响订单系统，如何解决？

> 在计算机领域有个经典的理论：可以通过引入一个中间层来解决依赖。

可以引进一层防腐层

```java
public class Order{
    UserAggr userAggr;
    public Order(UserAggr userAggr){
        this.userAggr = userAggr;
    }
    public UserInfo getUserIdInfo(){
        // 抽象的rpc接口调用
        UserInfo user = userAggr.getUserInfo(userId);
        return user;
    }
}


public class UserAggr{
    // UserService 和 User 都是用户系统 API 依赖提供的
    UserService userService;
    public Order(UserService userService){
        this.userService = userService;
    }
    public UserInfo getUserIdInfo(){
        // 抽象的rpc接口调用
        User user = userService.getUserInfo(userId);

        UserInfo info = transfer(user);
        
        return info;
    }
}
```
通过上面的代码改造我们可以看出，用户所用的变更都可以在防腐层屏蔽。

SPI机制也是经典的依赖倒置思维， 比如：在java中 数据库驱动加载机制。


## 总结

- 依赖倒置原则（DIP）指出高层模块不应该依赖低层模块； 两者都应该依赖于抽象。 抽象不应该依赖于细节。 细节应该取决于抽象。

- 在计算机领域有个经典的理论：可以通过引入一个中间层来解决依赖。


## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

