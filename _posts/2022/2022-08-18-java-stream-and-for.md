---
layout: post
title: java stream流和for循环简易比较
category: java
tags: [java]
excerpt: 工作中你用同时使用过java中的for循环和jdk8开始引入的java stream API吗？ 你觉得他们有性能差吗？
---
你好，我是Weiki，欢迎来到猿java。

 在实际工作中，或许你最开始接触jdk7，或许是jdk8或者是jdk11，对于java中的for循环和jdk8开始引入的java stream的使用大家各持意见，有人说java stream比for循环性能高，有人说java stream晦涩难懂，今天，我们就从代码的长期可维护性的角度来来谈谈 Streaming API和for循环的区别。

## 比较点

- 可读性
- 语法
- 表现


## 可读性

如果你是第一次接触 for循环和stream，其实两种语法的可读性都很难。


## 语法

场景一： 筛选出年龄大于20岁的用户

```java
// 定义一个Person类
public class Person {
    private String name;
    private int age;
    // getter and setter方法
}   
```
for循坏和stream 实现
```java
private void forLoop() {
    List<Person> list = List.of(p1, p2, p3...pn);
        List<String> newList = new ArrayList<>();
        for(Person p : list){
        if(p.getAge() > 20){
            newList.add(p.getName());
        }
    }
}

private void streaming(){
        List<Person> list=List.of();
        List<String> newList=list.stream()
        .filter(p->p.getAge()>20)
        .collect(Collectors.toList());
}  
```

场景二： 筛选出年龄大于20岁并且名字带'张'的用户

for循坏和stream 实现
```java
private void forLoop() {
    List<Person> list = List.of(p1, p2, p3...pn);
        List<String> newList = new ArrayList<>();
        for(Person p : list){
        if(p.getAge() > 20 && p.getName().contains("张")){
            newList.add(p.getName());
        }
    }
}

private void streaming(){
        List<Person> list=List.of();
        List<String> newList=list.stream()
        .filter(p -> p.getAge() > 20)
        .filter(p -> p.getName().contains("张"))
        .collect(Collectors.toList());
}  
```

场景三： 筛选出年龄在20到30岁并且名字不为空切带'张'的用户

for循坏和stream 实现
```java
private void forLoop() {
    List<Person> list = List.of(p1, p2, p3...pn);
        List<String> newList = new ArrayList<>();
        for(Person p : list){
        if(p.getAge() > 20 && p.getAge() < 30 && StringUtils.isNotEmpty(p.getName()) && p.getName().contains("张")){
            newList.add(p.getName());
        }
    }
}

private void streaming(){
        List<Person> list=List.of();
        List<String> newList=list.stream()
        .filter(p -> p.getAge() > 20 && p.getAge() < 30)
        .filter(p -> StringUtils.isNotEmpty(p.getName()) && p.getName().contains("张"))
        .map(p -> p.getName())
        .collect(Collectors.toList());
}  
```

通过上面的3个case，我们可以看出stream的复杂性比for循环更线性地扩展。另外，我们可以看到stream的filter(过滤器)，更贴近语义，更容易阅读。


## 表现
关于for循环和stream哪种风格表现更好，有很多意见。简短的版本基本上是，如果是一个小列表，for 循环的性能会更好；
如果列表很大，并行流将执行得更好。 而且由于并行流有相当多的开销，除非你能确定它值得开销，否则不建议使用这些。所以虽然差别不大，但for循环是靠纯粹的性能取胜的。
话虽如此，性能并不是衡量代码的唯一重要指标。软件工程中的一切都是一种权衡。在这种情况下，一个相关的权衡如下："高性能代码通常不是很可读，而可读代码通常不是很有性能"。由于如今维护成本远高于硬件成本，现在，权衡通常倾向于可读/可维护的代码。因此，除非毫秒性能是关键任务（并且您为此优化了整个堆栈和软件），否则在大多数情况下这不是一个强有力的论据。

## 个人建议

作为程序员，两种方式都必须掌握，为了降低项目的维护成本，请优先考虑使用 Stream API 而不是for循环。 Stream API学习有一定的成本，但从长远利益来看，无论是对项目还是对程序员来说，这种投资都会得到回报。

## 最后
如果你觉得本文章对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java

