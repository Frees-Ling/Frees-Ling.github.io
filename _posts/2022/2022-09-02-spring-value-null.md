---
layout: post
title: 如何解决spring EL注解@Value获取值为null的问题
category: spring
tags: [spring]
description: 如何解决spring EL注解@Value获取值为null的问题
keywords: spring, spring @Value注解, spring EL表达式
excerpt: 如何解决spring EL注解@Value获取值为null的问题
---

你好，我是Weiki，欢迎来到猿java。

很多时候，我们会使用到Spring的EL表达式，通过@Value("${xxx.xxx}")注解方式从属性文件中获取配置信息，但是，稍不注意，获取的值就为null，
今天我们就来聊聊Spring @Value 使用应该注意的点。

## 问题描述

如下代码，通过@Value("${xxx.xxx}")从 application.properties文件中获取 application.name 属性的值


```properties
# application.properties
application.name = yuan
```

```java
public class PropertyBean {
    @Value("${application.name}")
    private String applicationName;

    public static void main(String[] args) {
        System.out.println("applicationName=" + applicationName);
    }
}
```

我们先看下运行结果：

```text
applicationName=
```

很奇怪，为什么没有获取到application.name的值呢？

## 错误使用场景

**错误使用场景一**  

类未交给spring管理，如下代码：

```java
public class PropertyBean {
    @Value("${application.name}")
    private String applicationName;
}
```

@Value("${}")是Spring的EL表达式，属于spring的一种注入方式，
所以要想sprig把application.name的值注入给PropertyBean类的applicationName字段，就必须把PropertyBean类交给Spring管理，这样spring才知道哪里需要它自动注入。
因此解决办法可以在PropertyBean类上增加@Component注解：
```java
@Component
public class PropertyBean {
    @Value("${application.name}")
    private String applicationName;
}
```

**错误使用场景二**

类的字段被static或者final修饰，如下代码：

```java
@Component
public class PropertyBean {
    @Value("${application.name}")
    private static String applicationName;

}
```
PropertyBean类的applicationName字段被static修饰，导致获取为null，这是因为静态变量是类的属性，并不属于对象的属性，而Spring是基于对象的属性进行依赖注入的。所以用@Value注解注入静态变量是失败的。
解决办法是把字段applicationName前面的static或者final去掉。

**错误使用场景三**

使用PropertyBean的地方是new出来而不是通过依赖注入的，获取值为null。如下代码：

```java
@Component
public class PropertyBean {
    @Value("${application.name}")
    private String applicationName;

    // 此处 applicationName有值
    public static void main(String[] args) {
        System.out.println("applicationName=" + applicationName);
    }
}

@Service
public class SpringElService {
    public String getApplicationName(){
        // 通过new PropertyBean()获取对象
        PropertyBean bean = new PropertyBean();
        // 此处 applicationName为null
        return bean.getApplicationName();
    }
}
```

这种场景最容易被忽视，PropertyBean类中applicationName有值，SpringElService类中却为null，为什么？
为了帮助理解，我画了一个简单的抽象图，场景三里面，PropertyBean出现了两种类型bean，一种是Spring容器中管理的PropertyBean bean，applicationName的值spring可以自动注入， 一种是手动创建的PropertyBean bean，String类型的applicationName，如果没有显示赋值，默认为空。
![img.png](https://www.yuanjava.cn/assets/md/spring/value-null.png)


正确使用方式如下代码：

```properties
# aplication.properties
application.name = yuan
```

```java
@Component
public class PropertyBean {
    @Value("${application.name}")
    private String applicationName;
}

@Service
public class SpringElService {
    
    private final PropertyBean bean;
    // 构造器注入 bean
    public SpringElService(PropertyBean bean){
        this.bean = bean;
    }

    public String getApplicationName(){
        return bean.getApplicationName();
    }
}
```


## 总结

- 本文通过几个常见的错误场景分析了@Value获取值为空的原因
- spring为开发提供了很多便捷，但是稍微不注意就可能导致异常，所以对于一个新的框架，了解原理是很有必要，正所谓知其然还要知其所以然。


## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

