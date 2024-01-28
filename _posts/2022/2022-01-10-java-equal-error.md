---
layout: post
title: Java中的判断相等问题，你踩过几个坑？
category: java
tags: [java]
excerpt: Java中的判断相等问题，你踩过几个坑？
---

你好，我是Weiki，欢迎来到猿java。

在业务开发中，判断相等的逻辑是很常见的，因为在java语言中有原生数据类型，包装类，引用等，如果判等使用不当，小则出现Bug，未能达到真实判等作用，重则可能会引起内存泄露等问题。
所以今天我们就来聊聊java中的判等的问题，看看你的日常开发中踩过几个坑。

## 判等操作

在java中常见的的判等操作有：equal、compareTo 和 ==。 

> 温馨提示：单个 = 在java中是赋值的含义，不是数学中的等于号哦

## 数据类型

1. 原生数据类型，8个
```text
   1）byte： 字节，1个字节，8位，-128~127
   2）short：短整型，2个字节，16位
   3）int：  整型，4个字节，32位
   4）long： 长整型，8个字节，64位
   5）float：单精度小数，例如：5.2
   6）double：双精度浮点型
   7）char：  单个的字符，例如字母a，或者中文张，char ch = 'a'; char b = '张';
   8）boolean： 布尔类型,只有true和false
```

2. 包装数据类型，8个
```text
   1）Byte
   2）Short
   3）Int
   4）Long
   5）Float
   6）Double
   7）Char
   8）Boolean
```

3. 引用类型
```text
People people = new People();  people就为一个引用类型，指向new People()这个对象
```

## equals、compareTo、 == 的使用和分析

我们先看几个使用例子，然后对照结果来讲解区别

```java
int a = 10;
a == 10; true

long b = 1000L;
b == 1000L;  true

Object obj1 = new Object();
Object obj2 = new Object();
obj1 == obj2; // false
obj1.equals(obj2); // false

Integer integer1 = new Integer(1);
Integer integer2 = new Integer(1);
Integer integer3 = new Integer(200);
Integer integer4 = new Integer(200);
integer1 == integer2; // true
integer3 == integer4; // false       
integer1.equals(integer2); //false

String a = new String("1");
String b = new String("1");
a.equals(b); // true
```

为什么integer1 == integer2; 为true，而integer3 == integer4; 为false？

这是因为对于Integer类型，当值在-128~127时，存在一个缓存的概念，源码如下：java.lang.Integer.valueOf(java.lang.String, int)，同理，Long，Double也是一样，有兴趣的可以去看看源码。
```java
public final class Integer extends Number implements Comparable<Integer> {
    // low = -128  high = 127，使用的是缓存数据
    public static Integer valueOf(int i) {
        if (i >= IntegerCache.low && i <= IntegerCache.high)
            return IntegerCache.cache[i + (-IntegerCache.low)];
        // 使用了对象 
        return new Integer(i);
    }
}
```

为什么obj1 == obj2; 为false，而integer1 == integer2; 和 a.equals(b); 都为true

这是因为Object的equals是比地址，而Integer等包装数据类型和String重写了equlas方法，源码如下：
```java
public class Object{
    public boolean equals(Object obj) {
        return (this == obj);
    }
}

public class Integer{
    public boolean equals(Object obj) {
        if (obj instanceof Integer) {
            return value == ((Integer)obj).intValue();
        }
        return false;
    }
}

public class String{
    public boolean equals(Object anObject) {
        if (this == anObject) {
            return true;
        }
        return (anObject instanceof String aString)
                && (!COMPACT_STRINGS || this.coder == aString.coder)
                && StringLatin1.equals(value, aString.value);
    }

}
```

对于String类型这种特殊的类型，我们做更多的分析，首先看几个String使用的案例：
```java
// 案例1
String a = "1";
String b = "1";
a == b; //true

// 案例2
String a = "1";
String b = new String("1"); 
a == b; // false

// 案例3
String a = new String("2");
String b = new String("2");
a == b; //false

// 案例4
String a = new String("3").intern();
String b = new String("3").intern();
a == b; // false

// 案例5
String a = new String("2");
String b = new String("2");
a.equals(b); //true

```
对于String这种类型，为了节省内存，设计了字符串常量池机制。对于双引号的String，JVM会先对这个字符串进行检查，如果字符串常量池中存在相同内容的字符串对象的引用，则将这个引用返回；否则，创建新的字符串对象，然后将这个引用放入字符串常量池，并返回该引用。这种机制，就是字符串驻留或池化。
对于引用类型，比较的是引用指向的内存地址是否一致，也就是比较它们是不是同一个对象。

案例1，a,b 都能在字符串常量池中找到，所以 a == b 为true；

案例2，a指向字符串常量池，b指向堆栈，所以 a == b 为false；

案例3，new 出来的两个String是不同对象，引用当然不同，所以 a == b 为false；

案例4，使用 String 提供的 intern 方法也会走常量池机制，所以 a == b 为true；

java.lang.String.intern()源码
```java
    /**
     * Returns a canonical representation for the string object.
     * <p>
     * A pool of strings, initially empty, is maintained privately by the
     * class {@code String}.
     * <p>
     * When the intern method is invoked, if the pool already contains a
     * string equal to this {@code String} object as determined by
     * the {@link #equals(Object)} method, then the string from the pool is
     * returned. Otherwise, this {@code String} object is added to the
     * pool and a reference to this {@code String} object is returned.
     * <p>
     * It follows that for any two strings {@code s} and {@code t},
     * {@code s.intern() == t.intern()} is {@code true}
     * if and only if {@code s.equals(t)} is {@code true}.
     * <p>
     * All literal strings and string-valued constant expressions are
     * interned. String literals are defined in section 3.10.5 of the
     * <cite>The Java&trade; Language Specification</cite>.
     *
     * @return  a string that has the same contents as this string, but is
     *          guaranteed to be from a pool of unique strings.
     * @jls 3.10.5 String Literals
     */
    public native String intern();
```
通过上面的源码注释可以知道intern()可以使字符串驻留的在常量池中，而字符串常量池是一个固定容量的Map，如果业务代码中使用了intern()方法，可能会导致性能问题。

案例5，equals是对值内容判等，所以 a == b 为true；


## compareTo比较

将此对象与指定对象进行比较以进行排序。 返回一个负整数表示小于指定对象、零表示等于指定对象或正整数表示大于指定对象。源码如下：

```java
public interface Comparable<T> {
    /**
     * Compares this object with the specified object for order.  Returns a
     * negative integer, zero, or a positive integer as this object is less
     * than, equal to, or greater than the specified object.
     *
     * <p>The implementor must ensure
     * {@code sgn(x.compareTo(y)) == -sgn(y.compareTo(x))}
     * for all {@code x} and {@code y}.  (This
     * implies that {@code x.compareTo(y)} must throw an exception iff
     * {@code y.compareTo(x)} throws an exception.)
     *
     * <p>The implementor must also ensure that the relation is transitive:
     * {@code (x.compareTo(y) > 0 && y.compareTo(z) > 0)} implies
     * {@code x.compareTo(z) > 0}.
     *
     * <p>Finally, the implementor must ensure that {@code x.compareTo(y)==0}
     * implies that {@code sgn(x.compareTo(z)) == sgn(y.compareTo(z))}, for
     * all {@code z}.
     *
     * <p>It is strongly recommended, but <i>not</i> strictly required that
     * {@code (x.compareTo(y)==0) == (x.equals(y))}.  Generally speaking, any
     * class that implements the {@code Comparable} interface and violates
     * this condition should clearly indicate this fact.  The recommended
     * language is "Note: this class has a natural ordering that is
     * inconsistent with equals."
     *
     * <p>In the foregoing description, the notation
     * {@code sgn(}<i>expression</i>{@code )} designates the mathematical
     * <i>signum</i> function, which is defined to return one of {@code -1},
     * {@code 0}, or {@code 1} according to whether the value of
     * <i>expression</i> is negative, zero, or positive, respectively.
     *
     * @param   o the object to be compared.
     * @return  a negative integer, zero, or a positive integer as this object
     *          is less than, equal to, or greater than the specified object.
     *
     * @throws NullPointerException if the specified object is null
     * @throws ClassCastException if the specified object's type prevents it
     *         from being compared to this object.
     */
    public int compareTo(T o);
}
```


## 总结
1. 基本类型只能使用 ==，针对包装数据类型和 String 在内的引用类型，需要使用equals
2. 除包装数据类型和 String 以外的引用类型，== 和 equals都是比地址，如果需要 equal是比值，就需要重写equals方法和hashCode方法



## 踩坑点
1. 对于包装数据类型使用==比值，结果有时候对，有时候错
2. 对于String类型，使用了new String("").intern(),导致性能问题
3. 


## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
