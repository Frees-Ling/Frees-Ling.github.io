---
layout: post
title: SOLID设计原则系列之--Liskov替换原则
category: framework
tags: [framework]
excerpt: Liskov替换原则是什么？怎么使用Liskov替换原则？
---
你好，我是Weiki，欢迎来到猿java。

前面几篇文章，我们介绍了SOLID原则的单一职责原则和开闭原则，单一职责描述的模块需要对一类行为负责，开闭原则描述的是对扩展开放，对修改关闭。今天我们就来聊聊SOLID的第三个原则：Liskov替换原则。

## 什么是Liskov替换原则

Liskov替换原则(里式替换原则)，英文为：Liskov substitution principle, 简称：LSP，它是以作者 Barbara Liskov(一位美国女性计算机科学家，对编程语言和分布式计算做出了开创性的贡献，于2008年获得图灵奖)的名字命名的，Barbara Liskov 曾在1987年的会议主题演讲“数据抽象”中描述了子类型：

> Let Φ(x) be a property provable about objects x of type T. Then Φ(y) should be true for objects y of type S where S is a subtype of T.
>
> 设Φ(x)是关于T类型对象x的可证明性质。那么对于S类型的对象y，Φ(y)应该为真，其中S是T的子类型。

因为这种科学的定义过于抽象，于是在实际软件开发中的 Liskov 替换原则是这样的：

> The principle defines that objects of a superclass shall be replaceable with objects of its subclasses without breaking the application.
> That requires the objects of your subclasses to behave in the same way as the objects of your superclass.
>
> 该原则定义了在不破坏应用程序的前提下，超类的对象应该可以被其子类的对象替换，这就要求子类对象的行为方式与您的超类对象相同。

Robert C. Martin 对SLP的描述更加直接:
> Subtypes must be substitutable for their base types.
> 
> 子类型必须可以替代它们的基本类型。

通过上面几个描述，我们可以把LSP通俗的表达成：子类型必须能够替换其父类型。它在java领域描述的是继承关系。


## 如何实现Liskov替换原则

说起Liskov替换原则的实现，就不得不先看一个著名的违反LSP设计案例：正放形/长方形问题。尽管这个case已经有点老掉牙，但是为了帮助理解，我们还是炒一次剩饭。

我们的数学知识告诉我们：正方形是一种特殊的长方形，认同吗？因此用java代码可以分别定义 Rectangle(长方形) 和 Square(正方形)两个类，并且 Square extends Rectangle，整体代码如下：

```java
// Rectangle(长方形)类
public class Rectangle {
    private int height;
    private int width;

    // getter and setter
     
}
```

```java
// Square(正方形)类
public class Square extends Rectangle {
    // 设置边长 
    public void setSide(int side) {
        this.setHeight(side);
        this.setWidth(side);
    }
}
```

假设现在的需求是计算几何图形的面积，因此面积计算代码会如下实现：

```java
// 计算面积
public int area(){
    Rectangle r = // new Square(); or  new Rectangle();
    // 设置长度
    r.setHeight(3);
    // 设置宽度
    r.setWidth(4);
}

// 测试用例
assertThat(r.area() == 12)); 
```

按照我们的数学知识，上面的逻辑是否都没有毛病， 但是用代码实现面积的计算，就会出现歧义：如果 Rectangle r = new Rectangle(); assertThat断言是正确的，如果 Rectangle r = new Square(); assertThat断言就错误的。显然
正方形是一种特殊的长方形，在用代码计算面积时违背了LSP，两个类不能相互替换。这就不禁让我们产生怀疑：Square is a Rectangle？

如何解决这个bad case呢？

可以定义一个几何图形的接口，设定一个计算面积的方法，然后长方形、正方形...都实现这个接口，实现各自的面积计算逻辑，整体思路如下：

```java
// 基类
public interface Geometry{
    public int area();
}

public class Rectangle implements Geometry{
    public int area(){
        // implement Rectangle logic here
    }
}

public class Square implements Geometry{
    public int area(){
        // implement Square logic here
    }
}
```


我们再来看一个LSP使用的例子：

假设有一个股票交易的场景，而且需要支持债券、股票和期权等不同证券类型的多种交易类型，我们就可以考虑使用LSP来解决这个问题

首先，我们定义一个交易的基类，在基类中我们定义了买入和卖出两个方法实现
```java
// 定义一个交易类
public class Transaction{

    // 买进操作
    public void buy(String stock, int quantity, float price){
        // implement buy logic here
    };
    
    // 卖出操作
    public void sell(String stock, int quantity, float price){
        // implement sell logic here
    };
}
```

接着，我们定义了股票交易子类，股票交易和交易基类具有相同的行为：买入和卖出。所以只需要重写基类的方法，实现子类特定的实现就ok了。
```java
// 定义股票交易子类，定义股票特定的买卖动作逻辑
public class StockTransaction extends Transaction{
    
    @Override
    public void buy(String stock, int quantity, float price){
        // implement Stock-specific buy logic here
    }
    @Override
    public void sell(String stock, int quantity, float price){
        // implement Stock-specific sell logic here
    }
}
```

同样，我们还可以定义了基金交易子类，基金交易和交易基类具有相同的行为：买入和卖出。所以只需要重写基类的方法，实现子类特定的实现就ok了。
```java
// 定义基金交易子类，定义基金特定的买卖动作逻辑
public class FundTransaction extends Transaction{
    
    @Override
    public void buy(String stock, int quantity, float price){
        // implement Fund-specific buy logic here
    }
    @Override
    public void sell(String stock, int quantity, float price){
        // implement Fund-specific sell logic here
    }
}
```

同样，我们还可以定义了债券交易子类，债券交易和交易基类具有相同的行为：买入和卖出。所以只需要重写基类的方法，实现子类特定的实现就ok了。
```java
// 定义债券交易子类，定义债券特定的买卖动作逻辑
public class BondTransaction extends Transaction{
    
    @Override
    public void buy(String stock, int quantity, float price){
        // implement Bond-specific buy logic here
    }
    @Override
    public void sell(String stock, int quantity, float price){
        // implement Bond-specific sell logic here
    }
}
```

上述交易的案例，股票交易和基金交易子类替换基类之后，并没有破坏基类的买入卖出行为。更具体地说，替换的子类实例仍提供buy()和sell()，可以以相同方式调用的功能。这个符合LSP。

经过我们的抽象、分离和改造之后，Stock.updateStock()类就稳定下来了，再也不需要增加一个事件然后增加一个else if分支处理。这种抽象带来的好处也是很明显的：每次有新的库存变更事件，只需要增加一个实现类，其他的逻辑都不需要更改，当库存事件无效时只需要把实现类删除即可。


## 总结

Liskov替换原则扩展了OCP开闭原则，它描述的子类型必须能够替换其父类型，而不会破坏应用程序。因此，子类需要遵循以下规则：
- 不要对输入参数实施比父类实施更严格的验证规则。
- 至少对父类应用的所有输出参数应用相同的规则。

Liskov替换原则 相对前面的单一职责和开闭原则 稍微晦涩一些，因此在开发中容易误用，因此我们特别要注意类之间是否存在继承关系。

LSP不仅可以用在类关系上，也可以应用在接口设计中。

## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

