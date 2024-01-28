---
layout: post
title: 为什么spring 不推荐 @Autowired 用于字段注解？
category: spring
tags: [spring]
description: 为什么spring 不推荐 @Autowired 用于字段注解？
keywords: spring, spring autowired注解, spring字段注解
excerpt: 为什么spring 不推荐 @Autowired 用于字段注解？
---

你好，我是Weiki，欢迎来到猿java。

作为java程序员，肯定享受了spring给予的开发便捷福利。灵活便捷的注入，让身为码农的我们省去了不少的烦恼，但是，当你在idea里面对字段使用@Autowired注解时，
会出现一个波浪线的警告"Field injection is not recommended"， 为什么会这样？ 今天我们就来聊一聊其背后的深层原因吧。

## @Autowired警告

如下图，当字段上增加@Autowired注解时，告警的全部内容， 从spring4.0 开始，官方就不推荐@Autowire的使用在字段上。

![img.png](https://www.yuanjava.cn/assets/md/spring/spring-warn.png)

## spring注入方式
spring注入有3种方式：
1. Constructor-based dependency injection  基于构造器注入
2. Setter-based dependency injection       基于set方法注入
3. Field-based dependency injection        基于字段注入

**基于构造器注入**

基于构造器注入，顾名思义，就是在类的构造器上加@Autowired注解。这种注入方式的主要优点是可以将注入的字段声明为 final，
final修饰的字段是在运行时被初始化，可以直接赋值，也可以在实例构造器中赋值，赋值后不可修改。下文给出了一个基于构造器注入的例子：
```java
@Component
public class ConstructorBasedInjection {

    private final Object object;

    // @Autowired注解可以省去
    @Autowired
    public ConstructorBasedInjection(Object object) {
        this.object = object;
    }

}
```

**基于setter方法注入**
基于set方法注入，就是在setter方法上加@Autowired注解，当使用无参数构造函数或无参数静态工厂方法实例化Bean时，Spring容器会调用这些setter方法，
以便注入Bean的依赖项。下文给出了一个基于setter方法注入的例子：

```java

@Component
public class SetterBasedInjection {

    private final Object object;

    @Autowired
    public Object setObject(Object object) {
        this.object = object;
    }
    
    public Object getObject() {
        return object;
    }
}
```

**基于字段注入**

基于字段注入，就是在字段上加@Autowired注解，在构造bean之后，调用任何配置方法之前，Spring容器会立即注入这些字段。下文给出了一个基于字段注入的例子：

```java
@Component
public class FiledBasedInjection {
    @Autowired
    private final Object object;
}
```

从上面3种注入方式，我们可以看出，基于字段注入是最简洁的注入方式，因为它避免了添加繁冗的getter和setter样板代码，并且无需为类声明构造函数。
但是正如idea编译器警告的一样，基于字段注入方式势必存在某些缺点，以至于它的创造者Spring官方不推荐使用它，下文就给出几个基于字段注入可能的缺点。

## 基于字段的依赖注入的缺点

**容易引发NPE**

根据jvm虚拟机初始化类的加载顺序是：静态变量或静态语句块 –> 实例变量或初始化语句块 –> 构造方法 -> @Autowired 的顺序，
所以在编译时@Autowired 字段为null时不会报错，当调用其方法时出现空指针异常。示例代码：
```java
@Component
public class FiledBasedInjection {
    private String name;
    @Autowired
    private final User user;
    
    public FiledBasedInjection(){
        this.name = user.getName(); // NPE
    }
}
```

**缓解单一职责原则的违反**

使用基于字段的注解，我们无需关注类之间的依赖关系，完全依赖于spring IOC容器的管理，但是使用"基于构造器注入的方式"，
我们需要手动在类代码中去编写需要依赖的类，当依赖的类越来越多，我们就能发现 code smell，这个时候就能显示的提醒我们，代码的质量是否有问题。
因此，尽管字段注入不直接负责打破单一责任原则，但它通过隐藏了和构造器注入一样发现 code smell的机会。 示例代码：

@Component
public class ConstructorBasedInjection {

    private final Object object;
    private final Object object2;
            ...
    private final Object objectX;

    // @Autowired注解可以省去
    @Autowired
    public ConstructorBasedInjection(Object object,
                                     Object object2,
                                          ...       ,
                                     Object objectX) {
        this.object = object;
        this.object2 = object2;
             ...
        this.objectX = objectX;
    }

}

**其他原因**
...

## spring官方推荐的注入方式
@Autowired使用在基于字段的注入不被官方推荐，替代的方式有很多，比如@Inject，@Resource等注解，但是spring官方强烈推荐使用基于构造器注入的方式。
另外，据小编君观察，像国内，dubbo，rocketMQ等很多开源框架的源码都已经转向了基于构造器的注入方式，所以开发中我们应该尊重spring官方的推荐，尽管其他的方式可以解决，但是不推荐。

不过基于构造器注入有一个潜在的问题就是循环依赖，如下代码，ClassA初始化时需要classB，因此需要去初始化ClassB。
ClassB初始化时又需要依赖ClassA，进而转向初始化ClassA。所以就形成了经典的"循坏依赖问题"。 不过，spring3.0开始也给出了对应的解决方法，就是在构造器上面增加一个
@Lazy注解。

```java

@Component
public class ClassA {
    private final ClassB classB;
    
    @Lazy
    public ClassA(ClassB classB){
        this.classB = classB;
    }
}

@Component
public class ClassB {
    private final ClassA classA;
    
    public ClassB(ClassA classA){
        this.classA = classA;
    }
}
```

预知 @Lazy 注解是如何解决构造器循环依赖，请看下篇文章分解...

## 总结

- spring注入的方式有：基于字段注入，基于setter方法注入，基于构造器注入 3种方式。

- spring官方不推荐@Autowire使用在基于字段注入方式，推荐基于构造器的注入

- 尽管从很多资料上可以总结出一些不推荐字段注入的原因，但还未看到官方给的理由，所以我们先且尊重spring的建议。



## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

