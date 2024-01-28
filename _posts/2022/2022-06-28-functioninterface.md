---
layout: post
title: 什么是函数式接口？
category: java
tags: [java]
excerpt: 函数接口是什么？它和lambda表达式有什么关系？
---

你好，我是Weiki，欢迎来到猿java。


## Lambda官方说明

上一篇文章我们分析了lambda是什么，里面提到一个点：lambda必须依赖于函数式接口，这篇博文我们就来一起分析下什么是函数式接口

首选我们看一个List遍历的例子
```java
public class ListTest {
    public static void main(String[] args) {
        List<Integer> list = Arrays.asList(1, 2, 3, 4, 5, 6);

        //for method
        for(int i = 0; i < list.size(); i++){
            System.out.println("i=" + i);
        }
        // lambda method
        list.forEach(System.out::println);
    }

    // forEach method
    default void forEach(Consumer<? super T> action) {
        Objects.requireNonNull(action);
        for (T t : this) {
            action.accept(t);
        }
    }
}

/**
 * Represents an operation that accepts a single input argument and returns no
 * result. Unlike most other functional interfaces, {@code Consumer} is expected
 * to operate via side-effects.
 *
 * <p>This is a <a href="package-summary.html">functional interface</a>
 * whose functional method is {@link #accept(Object)}.
 *
 * @param <T> the type of the input to the operation
 *
 * @since 1.8
 */
@FunctionalInterface
public interface Consumer<T> {

    /**
     * Performs this operation on the given argument.
     *
     * @param t the input argument
     */
    void accept(T t);

    /**
     * Returns a composed {@code Consumer} that performs, in sequence, this
     * operation followed by the {@code after} operation. If performing either
     * operation throws an exception, it is relayed to the caller of the
     * composed operation.  If performing this operation throws an exception,
     * the {@code after} operation will not be performed.
     *
     * @param after the operation to perform after this operation
     * @return a composed {@code Consumer} that performs in sequence this
     * operation followed by the {@code after} operation
     * @throws NullPointerException if {@code after} is null
     */
    default Consumer<T> andThen(Consumer<? super T> after) {
        Objects.requireNonNull(after);
        return (T t) -> { accept(t); after.accept(t); };
    }
}
```
从上面的代码可以看出，从jdk8开始，list增加了forEach()方法进行遍历，forEach()接收一个Consumer类型的参数，进入Consumer可以看出该类有一个@FunctionalInterface
的注解，这个标识Consumer是一个函数式接口，接下来我们进入FunctionalInterface这个注解

```java
/**
 * An informative annotation type used to indicate that an interface
 * type declaration is intended to be a <i>functional interface</i> as
 * defined by the Java Language Specification.
 *
 * Conceptually, a functional interface has exactly one abstract
 * method.  Since {@linkplain java.lang.reflect.Method#isDefault()
 * default methods} have an implementation, they are not abstract.  If
 * an interface declares an abstract method overriding one of the
 * public methods of {@code java.lang.Object}, that also does
 * <em>not</em> count toward the interface's abstract method count
 * since any implementation of the interface will have an
 * implementation from {@code java.lang.Object} or elsewhere.
 *
 * <p>Note that instances of functional interfaces can be created with
 * lambda expressions, method references, or constructor references.
 *
 * <p>If a type is annotated with this annotation type, compilers are
 * required to generate an error message unless:
 *
 * <ul>
 * <li> The type is an interface type and not an annotation type, enum, or class.
 * <li> The annotated type satisfies the requirements of a functional interface.
 * </ul>
 *
 * <p>However, the compiler will treat any interface meeting the
 * definition of a functional interface as a functional interface
 * regardless of whether or not a {@code FunctionalInterface}
 * annotation is present on the interface declaration.
 *
 * @jls 4.3.2. The Class Object
 * @jls 9.8 Functional Interfaces
 * @jls 9.4.3 Interface Method Body
 * @jls 9.6.4.9 @FunctionalInterface
 * @since 1.8
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface FunctionalInterface {}
```
从源码中我们可以抽取FunctionalInterface注解的几个重要信息：

- FunctionalInterface注解是从jdk1.8 开始引入
- FunctionalInterface注解是一种信息性注释类型，用于指示接口类型声明旨在成为 Java 语言规范定义的功能接口
- 函数式接口有且仅有一个抽象方法，因为所有的类默认继承java.lang.Object类，所以从Object类继承下来的抽象方法不会计入该接口的抽象方法总数
- 函数式接口的实例有3种创建方式：lambda表达式、方法引用或构造函数引用
- FunctionalInterface注解只能用于接口类型，而不能用于注释类型、枚举或类，如果此注解用于非接口，则编译器会生成错误信息
- 只要接口符合函数式接口的特征，不论接口是否加了FunctionalInterface注解，编译器都会把这个接口当做函数式接口处理

## 最后
本博文从一个list的遍历例子，我们一层一层进入源码，最后进入到FunctionalInterface这个函数式接口，通过官方源码对FunctionalInterface的解释我们对FunctionalInterface函数式接口有了一个整体的了解，接下来的博文我们讲从细节一点一点来分析FunctionalInterface在实际工作中的应用。

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
