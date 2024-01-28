---
layout: post
title: SOLID设计原则系列之--开闭原则
category: framework
tags: [framework]
excerpt: 开闭原则是什么？它在软件设计中起到了什么作用？
---
你好，我是Weiki，欢迎来到猿java。

真实工作中，你是否是这样运作：一个需求过来，把原来的代码改一遍，再一个需求过来，又把上一个需求的代码改一遍，很多重复的工作还是在日复一日的重复，有什么好的办法改善吗？
相信有经验的小伙伴一定听过：对扩展开放，对修改关闭。那么，你知道这句话的真正含义吗？今天我们就来聊聊开闭原则到底是怎么实现的。

## 什么是开闭原则

开放封闭原则，英文是：Open–closed principle， 简称OCP，是该原则是 Bertrand Meyer 在1988年提出的，原则指出：

> Software entities should be open for extension, but closed for modification.
>
> 软件实体应该对扩展开放，对修改关闭。


## 如何实现开闭原则

"对扩展开放，对修改关闭"，如何理解呢？我们先看一个案例，如下图，给出了电商领域库存系统库存变更的简易模型图，库存系统接收外部系统库存变更事件，然后对数据库中的库存进行修改。
![img.png](https://www.yuanjava.cn/assets/md/framework/stock.png)

面对这个业务需求，很多人的代码会写出这样

```java
public class Stock {
  
    public void updateStock(String event){
        
        if("outOfStock" == event){
            // todo 出库事件   库存操作
            
        }else if("warehousing" == event){
            // todo 入库事件   库存操作
        }
    }
}
```

这时，新的需求来了：WMS仓储系统内部会产生盘点事件(盘盈/盘亏)，这些事件会导致变更库存。于是，代码就会发展成下面这样

```java
public class Stock {
  
    public void updateStock(String event){
        
        if("outOfStock" == event){
            // todo 出库事件   库存操作
            
        }else if("warehousing" == event){
            // todo 入库事件   库存操作
            
        }else if("panSurplus" == event){
            // todo 盘盈事件   库存操作
            
        }else if("loss" == event){
            // todo 盘亏事件   库存操作
        }
    }
}
```

很显然，上述代码的实现，每来一个需求，就需要修改一次代码，在方法中增加一个else if分支，因此 Stock 类就一直处于变更中，不稳定。

有没有什么好的办法，可以使得这个代码不用被修改，但是又能够灵活的扩展，满足业务需求呢？ 

这个时候我们就要搬出java的三大法宝：**继承，实现，多态**。

我们发现整个业务模型是：事件导致库存变更。所以，能不能把事件抽离出来？于是，可以把事件模型抽象成一个接口，代码如下

![img.png](https://www.yuanjava.cn/assets/md/framework/model.png)

```java
public interface Event {
    public void updateStock(String event);
}
```
每种事件对应一种库存变更，抽象成一个具体的实现类，代码如下

入库事件
```java
public class WarehousingEvent implements Event {
    public void updateStock(String event){
        // 业务逻辑
    }
}
```

出库事件
```java
public class OutOfStockEvent implements Event {
    public void updateStock(String event){
        // 业务逻辑
    }
}
```

xxx事件
```java
public class XXXEvent implements Event {
    public void updateStock(String event){
        // 业务逻辑
    }
}
```

最后，Stock类中updateStock()库存变更逻辑就可以抽象成下面这样

```java

public class Stock {
  
    public void updateStock(String event){
        // 根据事件类型获取真实的实现类
        Event event = getEventInstance(event);
        // 库存变更操作
        event.updateStock();
    }
}

```

经过我们的抽象、分离和改造之后，Stock.updateStock()类就稳定下来了，再也不需要增加一个事件然后增加一个else if分支处理。这种抽象带来的好处也是很明显的：每次有新的库存变更事件，只需要增加一个实现类，其他的逻辑都不需要更改，当库存事件无效时只需要把实现类删除即可。


## 总结

通过上面的案例，我们演示了开闭原则的整个抽象和实现过程。业务或许有点简单，但是代表意义很强。

开闭原则的核心是对扩展开放，对修改关闭。因此，当你的业务需求一直需要修改同一段代码时，你就得谨慎观察业务是不是和上述案例有类似的问题，多思考代码修改的理由是什么？它们之间是不是有一定的共同性？能不能把这些变更点分离出来，通过扩展来实现而不是修改代码？

其实在业务开发中还有很多类似的场景，比如：电商系统中的会员系统，需要根据用户不同的等级计算不同的费用； 机票系统，根据用户不同的等级(普通，白金用户，黄金用户...)提供不同的售票机制；网关系统中，根据不同的粒度(接口，ip，服务，集群)来实现限流；

可能有小伙伴会反驳，我业务场景有类似的场景，但是逻辑简单，几个if else就搞定了，没有必要去搞这么复杂的设计。

本人建议：功夫在平时，功夫在细节。

  很多人总抱怨业务开发技术成长慢，特别是对于初级程序员，但是大部门人的起点都是业务的CRUD，如果你能在业务curd过程中想办法"挖掘"和"套用"某些
设计模式，通过这种长期的刻意练习，量变产生质变，慢慢的你就能领会这些经典设计原则的奥妙，无形中，你就和身边的小伙伴拉拉开了举例，终有一天你也能写出让人赏心悦目的代码。


## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

