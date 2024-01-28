---
layout: post
title: ThreadLocal如何保证线程安全？
category: java
tags: [java]
excerpt: ThreadLocal如何保证线程安全
--- 
你好，我是Weiki，欢迎来到猿java。

身为java程序员，当你想跳槽加薪(特别是高阶岗位)，ThreadLocal似乎成为了一个不可回避的知识点，除了面试，如果你扒过框架源码，也会在很多场景看到ThreadLocal的身影，ThreadLocal是大牛Doug Lead的杰作，一个从jdk 1.2 版本就存在的宝藏，今天就让我们一起来揭开它那神秘的面纱！

> 声明：本文源码均基于 jdk1.8.0_201

## 1、ThreadLocal 是什么？

ThreadLocal，字面意思：线程本地。位于 jdk 的java.lang包中，支持泛型，下面就是官方源码对 ThreadLocal 的描述：

```java 
/**
* This class provides thread-local variables.  These variables differ from
* their normal counterparts in that each thread that accesses one (via its
* {@code get} or {@code set} method) has its own, independently initialized
* copy of the variable.  {@code ThreadLocal} instances are typically private
* static fields in classes that wish to associate state with a thread (e.g.,
* a user ID or Transaction ID).
*
* <p>For example, the class below generates unique identifiers local to each
* thread.
* A thread's id is assigned the first time it invokes {@code ThreadId.get()}
* and remains unchanged on subsequent calls.
*
* 使用样例省略...
*
* <p>Each thread holds an implicit reference to its copy of a thread-local
* variable as long as the thread is alive and the {@code ThreadLocal}
* instance is accessible; after a thread goes away, all of its copies of
* thread-local instances are subject to garbage collection (unless other
* references to these copies exist).
*
* @author  Josh Bloch and Doug Lea
* @since   1.2
  */
  public class ThreadLocal<T> {
  // 代码省略
  }
```

源码注释大意是：ThreadLocal类提供线程局部变量。这些变量与普通的对应变量的不同之处在于：每个访问一个变量的线程(通过它的get或set方法)都有自己独立初始化的变量副本。ThreadLocal实例通常是类中的私有静态字段，它们希望将状态与线程相关联(例如，用户ID或事务ID)。
只要线程是存活的，并且ThreadLocal实例是可访问的，每个线程都持有对其线程局部变量副本的隐式引用；在一个线程消失后，它的所有线程本地实例副本都要服从垃圾收集(除非存在对这些副本的其他引用)。

所以：ThreadLocal 是什么？

结论：ThreadLocal 是用来提供线程局部变量，使得每个线程都可以拥有自己独立初始化的变量副本。

定义看起来台晦涩，我们写个样例感受到ThreadLocal的使用，代码中维护一个全局的ThreadLocal<Object> local变量，然后分别创建3个线程，每个线程内部创建一个局部的Objec对象，然后分别调用ThreadLocal的set(object)和get()，代码如下：
```java
public class ThreadLocalTest {
    public static void main(String[] args) { 
    // 创建一个ThreadLocal 实例        
    ThreadLocal<Object> local = new ThreadLocal<>();

       // 线程1
      Thread thread1 = new Thread(() -> {
            Object object = new Object();
            local.set(object);
            System.out.println("ThreadName:" + Thread.currentThread().getName() + ",getResult:" + local.get() + ",hashCode:" + local.hashCode());
       });

        // 线程2
       Thread thread2 = new Thread(() -> {
            Object object = new Object();
            local.set(object);
            System.out.println("ThreadName:" + Thread.currentThread().getName() + ",getResult:" + local.get() + ",hashCode:" + local.hashCode());
       });

        // 线程3
       Thread thread3 = new Thread(() -> {
            Object object = new Object();
            local.set(object);
            System.out.println("ThreadName:" + Thread.currentThread().getName()+ ",getResult:" + local.get() + ",hashCode:" + local.hashCode());
        });

        thread1.start();
        thread2.start();
        thread3.start();
    }
}

```
idea 运行结果
```text
ThreadName:Thread-0,getResult:java.lang.Object@57c5b046,hashCode:1493325006
ThreadName:Thread-1,getResult:java.lang.Object@2e4e6427,hashCode:1493325006
ThreadName:Thread-2,getResult:java.lang.Object@1232cc0,hashCode:1493325006
```
通过运行结果，我们可以看到3个线程分别get到了自己set的object副本，满足源码每个线程内一个独立备份的描述，因此我们会好奇ThreadLocal的set()和get()方法到底做了些什么呢？

## 2、源码分析
接下来就一起分析ThreadLocal的源码(源码的原文注释会适当的删减)，此过程有些枯燥，烦请大家耐心往下看：

```java  
public void set(T value) {
// 获取当前线程
Thread t = Thread.currentThread();
// 获取ThreadLocalMap
ThreadLocalMap map = getMap(t);
if (map != null)
map.set(this, value);
else
createMap(t, value);
}

ThreadLocalMap getMap(Thread t) {
return t.threadLocals; // 此处会跳转到java.lang.Thread中
}
void createMap(Thread t, T firstValue) {
t.threadLocals = new ThreadLocalMap(this, firstValue);
}

private void set(ThreadLocal<?> key, Object value) {
   Entry[] tab = table;
   int len = tab.length;
   int i = key.threadLocalHashCode & (len-1);
   // 遍历Entry数组
   for (Entry e = tab[i];
       e != null;
       e = tab[i = nextIndex(i, len)]) {
           ThreadLocal<?> k = e.get();
if (k == key) {
e.value = value;
return;
}

            if (k == null) {
                replaceStaleEntry(key, value, i);
                return;
             }
        }
        tab[i] = new Entry(key, value);
        int sz = ++size;
        if (!cleanSomeSlots(i, sz) && sz >= threshold)
           rehash();
        }

static class ThreadLocalMap {
static class Entry extends WeakReference<ThreadLocal<?>> {
/** The value associated with this ThreadLocal. */
Object value;

        Entry(ThreadLocal<?> k, Object v) {
           super(k); // 指向 WeakReference 的隐私引用
           value = v;
        }
}
}

ThreadLocalMap(ThreadLocal<?> firstKey, Object firstValue) {
    table = new Entry[INITIAL_CAPACITY];
    int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
    table[i] = new Entry(firstKey, firstValue);
    size = 1;
    setThreshold(INITIAL_CAPACITY);
}
 Entry(ThreadLocal<?> k, Object v) {
super(k);
value = v;
}
```

ThreadLocal.set()方法整体流程如下:

```text
每次进入set()方法，都会调用Thread.currentThread()方法获取到当前的线程对象;

然后调用 getMap(t)获取当前线程中的ThreadLocalMap对象，通过源码调试，我们知道ThreadLocalMap类型的threadLocals引用位于java.lang.Thread类中，这样对可以断定，每个Thread都持有一个ThreadLocalMap；

getMap(t)后会判断结果是否为空，非空则调用ThreadLocalMap.set()方法，空则调用createMap()用线程和值创建新的ThreadLocalMap对象;

ThreadLocalMap是ThreadLocal的一个静态内部类，ThreadLocalMap内部再封装一个静态的内部Entry类来存放值，Entry继承WeakReference弱引用，所以最后数据存入一个table数组，数组的元素对象有两个字段，refrent==threadLocal，value==的object；

ThreadLocalMap.set()方法，先从Entry[]数组中查询当前key对应的引用，如果存在则返回，如果不存在，则清除replaceStaleEntry(key, value, i)，处理内存泄露问题；

createMap()底层维护的是一个Entry[]，来存放ThreadLocal和value；

从set()中也可以看出ThreadLocalMap是惰性构造的，所以我们只有在至少有一个条目要放进去时才创建一个ThreadLocalMaps。

```

ThreadLocal.get()方法

```java 
public T get() {
Thread t = Thread.currentThread();
ThreadLocalMap map = getMap(t);
if (map != null) {
ThreadLocalMap.Entry e = map.getEntry(this);
if (e != null) {
@SuppressWarnings("unchecked")
T result = (T)e.value;
return result;
}
}
return setInitialValue();
}
```
ThreadLocal的get()方法比较简单，如果当前线程存在ThreadLocalMap则直接从map中获取，否则调用setInitialValue()，该方法类似set()。

最后，我们通过两张图片来总结ThreadLocal

![img.png](https://www.yuanjava.cn/assets/md/java/threadlocal.png)

![img.png](https://www.yuanjava.cn/assets/md/java/threadlocal2.png)

每个Thread线程类持有一个ThreadLocalMap，ThreadLocalMap中封装了Entry，Entry继承了WeakReference类，因此Entry类有两个字段，referent指向ThreadLocal，value指向用户入参。


思考： 为什么ThreadLocalMap的引用需要维护在Thread中，而不是ThreadLocal中呢？

在 JDK 的实现方案里面，ThreadLocal 仅仅是一个代理工具类，内部并不持有任何与线程相关的数据，所有和线程相关的数据都存储在 Thread 里面，这样的设计容易理解。而从数据的亲缘性上来讲，ThreadLocalMap 属于 Thread 也更加合理。


## 3、ThreadLocal 的作用
Doug Lea 花这么大的代码去设计一个ThreadLocal类主要是为了解决说明问题呢？
1. 多线程访问同一个共享变量的时候并且有并发问题，解决办法之一就是每个线程访问线程自己的变量来避免线程不安全问题，这个本地变量就是ThreadLocal来实现的。

2. 当ThreadLocal维护本地变量的时候，该变量存在线程本地，其他线程无法访问，这样就做到了线程之间隔离，也就没有线程安全问题。


4、ThreadLocal 使用实例
想必这个问题是小伙伴们最关心的问题，各种博文中都在强调ThreadLocal的重要性，难道只是为了应付面试吗？答案当然不是，下文就来给大家看下现实中一个重量级框架对ThreadLocal使用的案例。

ThreadLocal在spring事务中的使用

```java 
org.springframework.transaction.support.TransactionSynchronizationManager(spring-5.0.7-RELEASE)
public abstract class TransactionSynchronizationManager {
private static final ThreadLocal<Map<Object, Object>> resources =
new NamedThreadLocal<>("Transactional resources");

	private static final ThreadLocal<Set<TransactionSynchronization>> synchronizations =
			new NamedThreadLocal<>("Transaction synchronizations");

	private static final ThreadLocal<String> currentTransactionName =
			new NamedThreadLocal<>("Current transaction name");

	private static final ThreadLocal<Boolean> currentTransactionReadOnly =
			new NamedThreadLocal<>("Current transaction read-only status");

	private static final ThreadLocal<Integer> currentTransactionIsolationLevel =
			new NamedThreadLocal<>("Current transaction isolation level");

	private static final ThreadLocal<Boolean> actualTransactionActive =
			new NamedThreadLocal<>("Actual transaction active");
}
```
Spring 使用 ThreadLocal 来传递事务信息，因此这个事务信息是不能跨线程共享的。

ThreadLocal 在dubbo中的使用

```java
package org.apache.dubbo.cache.support.threadlocal;

import java.util.HashMap;
import java.util.Map;
import org.apache.dubbo.cache.Cache;
import org.apache.dubbo.common.URL;

public class ThreadLocalCache implements Cache {
private final ThreadLocal<Map<Object, Object>> store = ThreadLocal.withInitial(HashMap::new);

    public ThreadLocalCache(URL url) {
    }

    public void put(Object key, Object value) {
        ((Map)this.store.get()).put(key, value);
    }

    public Object get(Object key) {
        return ((Map)this.store.get()).get(key);
    }
}

```
ThreadLocal 在dubbo中传递上下文信息的

上面只是列举了2个重量级框架对ThreadLocal的使用，相信在今后大家的工作中，随着大家对技术的了解越深入，ThreadLocal见到的场景也就越多，所以特别鼓励大家扒源码哦。


## 5、ThreadLocal内存泄露
内存泄露的原因
ThreadLocal 本身不存储值，它只是作为Entry中的一个key，让Thread从ThreadLocalMap中获取value，当Thread 持有的 ThreadLocalMap 一直都不会被回收，再加上 ThreadLocalMap 中的 Entry 对 ThreadLocal 是弱引用（WeakReference），所以只要 ThreadLocal 结束了自己的生命周期是可以被回收掉的。但是 Entry 中的 Value 却是被 Entry 强引用的，所以即便 Value 的生命周期结束了，Value 也是无法被回收的，从而导致内存泄露。

如下图，当ThreadLocalRefA = null时，ThreadLocalA就会被回收，原来指向ThreadLocalA的key就会变为NULL，Thread ReafA引用ThreadA，ThreadA又引用ThreadLocalMapA，ThreadLocalMapA又引用了Entry，Entry对象又引用了value，这个map的key已经为NULL，value则永远无法回收，造成了内存泄露。

![img.png](https://www.yuanjava.cn/assets/md/java/xielou.png)

内存泄露的解决办法

主动调用ThreadLocal的remove()方法，将ThreadLocal中的value删除，remove()是jdk1.5引入的，主要是用于解决内存泄露问题；
另外，在ThreadLocal的set()，get()方法中也会有清除key为null的value的操作，以免内存泄露。

其实set()，get()，remove()方法最终都是调用expungStakeEntry()方法，源码如下，我在9个核心步骤上加了注释。

```java 
// 1.staleSlot 需要被删除对象在Entry[]中的位置
private int expungeStaleEntry(int staleSlot) {
Entry[] tab = table;
int len = tab.length;

            // expunge entry at staleSlot 
            // 2.删除位置的值，因为key已经为null，所以只需要将value置为null，删除
            tab[staleSlot].value = null;
            // 3.将entry对象赋值为null
            tab[staleSlot] = null;
            // 4.Entry数组删除一个对象，size减1
            size--;

            // Rehash until we encounter null
            Entry e;
            int i;
            // 5.for循坏从当前向后循坏处理Entry中的ThreadLocal对象，将遇到null
            // 之前的所有对象重hash(可以理解成数组中删除某个元素，后面所有元素需要前移动)
            for (i = nextIndex(staleSlot, len);
                 (e = tab[i]) != null;
                 i = nextIndex(i, len)) {
                 //6.获取下一个entry
                ThreadLocal<?> k = e.get();
                // 7.key为null，说明threadLocal的弱引用已经没有了，则删除key和value
                if (k == null) {
                    e.value = null;
                    tab[i] = null;
                    size--;
                } else { // 8.key不为null，则重hash
                    int h = k.threadLocalHashCode & (len - 1);
                    if (h != i) {
                        tab[i] = null;

                        // Unlike Knuth 6.4 Algorithm R, we must scan until
                        // null because multiple entries could have been stale.
                        // 9.从当前的位置h往后找，找到null的位置将e填入
                        while (tab[h] != null) 
                            h = nextIndex(h, len);
                        tab[h] = e;
                    }
                }
            }
            return i;
        }
```        
解决内存泄露的代码实例

```java
public static void resolveMemoryLeaks(){
  ThreadLocal<Object> local = new ThreadLocal<>();
    for(int i = 0; i < 100; i++){
        new Thread(() -> {
        Object object = new Object();
        local.set(object);

                // 解决内存泄露
                local.remove();
            });
        }
}
```

## 6、ThreadLocal 如何在父子线程及线程池中传递

在实际工作中会有很多业务场景需要创建子线程来执行一些任务，那么子线程如何获取父线程的本地变量值呢？当使用线程池时，子线程又如何获取到最新的父线程的本地变量呢？答案是：InheritableThreadLocal

测试用例代码：

```java 
public class InheritableThreadLocalTest {

    public static ThreadLocal<String> tl = new ThreadLocal();

    public static InheritableThreadLocal<String> itl = new InheritableThreadLocal();

    public static String msg = "hello world";

    public static void main(String[] args) throws InterruptedException {

        tl();
        itl();
    }

    public static void tl() throws InterruptedException {
        tl.set(msg);

        System.out.println("tl主线程获取的msg：" + tl.get());

        new Thread(() -> System.out.println("tl子线程获取的msg：" + tl.get())).start();

        // 线程睡眠1s
        TimeUnit.SECONDS.sleep(1L);
    }

    public static void itl() throws InterruptedException {
        itl.set(msg);

        System.out.println("itl主线程获取的msg：" + itl.get());
        new Thread(() -> System.out.println("itl子线程获取的msg：" + itl.get())).start();

        // 线程睡眠1s
        TimeUnit.SECONDS.sleep(1L);
    }
}
```
idea 运行结果

tl主线程获取的msg：hello world
tl子线程获取的msg：null
itl主线程获取的msg：hello world
itl子线程获取的msg：hello world
通过运行结果可以看到ThreadLocal无法在子线程中传递父线程的变量msg，InheritableThreadLocal可以做到。
查看源码可以看到：InheritableThreadLocal继承了ThreadLocal，因此InheritableThreadLocal中维护了下面两个变量，这两个变量都是Thread私有的，因此可以查看java.lang.Thread源码：

```java 
ThreadLocal.ThreadLocalMap threadLocals = null;
ThreadLocal.ThreadLocalMap inheritableThreadLocals = null;

private void init(ThreadGroup g, Runnable target, String name,
long stackSize, AccessControlContext acc,
boolean inheritThreadLocals) {
// 省略部分代码
if (inheritThreadLocals && parent.inheritableThreadLocals != null)
this.inheritableThreadLocals =
ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
// 省略部分代码

}

```
源码中核心的if语句，其实就是把父线程的inheritableThreadLocals对象全部拷贝到子线程的threadLocals，这样子线程就拥有了父线程的变量值了。

InheritableThreadLocal使用个人建议
不建议你在线程池中使用 InheritableThreadLocal，不仅仅是因为它具有 ThreadLocal 相同的缺点(可能导致内存泄露)，更重要的原因是：线程池中线程的创建是动态的，很容易导致继承关系错乱，如果你的业务逻辑依赖 InheritableThreadLocal，那么很可能导致业务逻辑计算错误，而这个错误往往比内存泄露更要命。


## 7、面试改如何回答ThreadLocal呢？
到此，我们就把ThreadLocal分析完毕，感谢你耐心的看下来，接下来就是放大招的时候：面试中改如何回答ThreadLocal的问题呢？
> 面试官：你能讲讲你对ThreadLocal的理解吗？ 
> 
> 候选人：
> 
> 首先：可以讲讲数据结构，内部封装的ThreadLocalMap，Entry，弱引用；
> 
> 初级岗位候选人必须会，代表看过源码。初级岗位候选人以上必须会。

> 其次：讲讲ThreadLocalMap解决什么问题；
> 
> 初级岗位候选人面试的加分题，初级以上必须会。

> 接着：可以讲讲ThreadLoca内存泄露的问题以及解决方法
> 
> 初级岗位候选人面试的加分题，初级以上必须会。

> 接着：可以讲讲ThreadLocal在一些框架中的使用或者你工作中的使用
> 
> 高级岗位候选人加分题，高级岗位候选人以上必须会。

> 最后：可以讲讲ThreadLocal父子线程传值以及个人的理解
> 
> 高级岗位候选人加分题，高级岗位候选人以上必须会。

## 最后
如果你觉得本文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货，欢迎关注公众号：猿java