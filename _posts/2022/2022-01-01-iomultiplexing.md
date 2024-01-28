---
layout: post
title: 深入剖析IO多路复用
category: linux
tags: [linux]
excerpt: 面试中经常会问到 IO多路复用，那么你知道它是怎么工作的吗？
---

你好，我是Weiki，欢迎来到猿java。

IO多路复用技术，不管是面试，还是平时的技术积累，它都是一个重要的知识点，很多高性能的技术框架都有它的身影。那么，什么是 IO多路复用？ IO多路复用 解决了什么问题？今天就我们就一起来盘盘它。

申明：本文基于linux系统
现如今，很多系统或者框架，底层都是通过Socket编程模型来实现网络通信，因此在讲解 IO多路复用之前我们先铺垫一下关于Socket的知识，以便大家更好的理解IO多路复用，关于Socket的知识，可以参考我往期的博文：猿java：你知道 Socket 是怎么创建的吗？如果你已经有了Scoket方面的知识可以跳过这一步。

有了对socket的认知后，我们再来看下常见的IO模型：

## 1. 常见的IO模型
   常见的网络 IO 模型分为四种：同步阻塞 IO(Blocking IO, BIO)、同步非阻塞IO(NIO)、IO 多路复用、异步非阻塞 IO(Async IO, AIO)，其中AIO为异步IO，其他都是同步IO。

### 1.1 同步阻塞IO-BIO
同步阻塞IO：在线程处理过程中，如果涉及到IO操作，那么当前线程会被阻塞，直到IO处理完成，线程才接着处理后续流程。如下图，服务器针对客户端的每个socket都会分配一个新的线程处理，每个线程的业务处理分2步，当步骤1处理完成后遇到IO操作(比如：加载文件)，这时候，当前线程会被阻塞，直到IO操作完成，线程才接着处理步骤2。
![img.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img.png)
实际使用场景：在Java中使用线程池的方式去连接数据库，使用的就是同步阻塞IO模型。

模型的缺点：因为每个客户端存都需要一个新的线程，势必导致线程被频繁阻塞和切换带来开销。

### 1.2 同步非阻塞 IO-NIO(New IO)
同步非阻塞IO：在线程处理过程中，如果涉及到IO操作，那么当前的线程不会被阻塞，而是会去处理其他业务代码，然后等过段时间再来查询 IO 交互是否完成。如下图：Buffer 是一个缓冲区，用来缓存读取和写入的数据；Channel 是一个通道，负责后台对接 IO 数据；而 Selector 实现的主要功能，是主动查询哪些通道是处于就绪状态。Selector复用一个线程，来查询已就绪的通道，这样大大减少 IO 交互引起的频繁切换线程的开销。
![img_1.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_1.png)

实际使用场景：Java NIO 正是基于这个 IO 交互模型，来支撑业务代码实现针对 IO 进行同步非阻塞的设计，从而降低了原来传统的同步阻塞 IO 交互过程中，线程被频繁阻塞和切换带的开销。NIO使用的经典案例是Netty框架，Elasticsearch底层实际上就是采用的这种机制。

### 1.3 IO 多路复用
下文会详细讲解

### 1.4 异步非阻塞 IO-AIO
AIO 是异步IO的缩写，即Asynchronized IO。对于AIO来说，它不是在IO准备好时再通知线程，而是在IO操作已经完成后，再给线程发出通知。因此，AIO是完全不会阻塞的。此时，我们的业务逻辑将变成一个回调函数，等待IO操作完成后，由系统自动触发。netty5中有使用到 AIO，但是花了大力气，netty5性能没能在netty4上有大的飞越，所以netty5最终被下线。

接下来就是我们今天的主角 IO多路复用 出场

## 2. 什么是 IO多路复用？
   想必我们在学习一个新技术或者新概念的时候，最大的疑问就是概念本身，IO多路复用也不例外，要想弄清楚 IO多路复用是什么，可以先从 IO多路复用中的”路“下手。

路：本意是道路，比如：城市的柏油路，乡村的泥巴路，这些大家肯定不陌生。
那么：IO中的路是指什么呢？

别着急，我们先还是看看 IO 是什么？

在计算机中，IO是输入和输出(Input/Output)，直接信息交互是通过底层的 IO 设备来实现的。针对不同的操作对象，可以划分为磁盘I/O、网络I/O、内存映射I/O等，只要具有输入输出类型的交互系统都可以认为是I/O系统。
最后，一起看下”路“和”多路“

在socket 编程中，[ClientIp, ClientPort, ServerIp, ServerPort, Protocol] 5元素可以唯一标识一个socket 连接，基于这个前提，同一个服务的某个端口 可以和 n个客户端建立socket连接，可以通过下图来大致描述：
![img_2.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_2.png)


所以，每个客户端和服务器的socket 连接就可以看做”一路“，多个客户端和该服务器的socket连接就是”多路“，从而，IO多路就是多个socket连接上的输入输出流，复用就是多个socket连接上的输入输出流由一个线程处理。 因此 IO多路复用可以定义如下：

Linux中的 IO多路复用是指：一个线程处理多个IO流。

## 3. IO多路复用有哪些实现机制
   先看下基础socket的模型，才能与下文IO多路复用机制形成对比，伪代码实现如下
```
listenSocket = socket(); //系统调用socket()函数，调用创建一个主动socket
bind(listenSocket);  //给主动socket绑定地址和端口
listen(listenSocket); //将默认的主动socket转换为服务器使用的被动socket(也叫监听socket)
while (true) { //循环监听客户端连接请求
   connSocket = accept(listenSocket); //接受客户端连接，获取已连接socket
   recv(connsocket); //从客户端读取数据，只能同时处理一个客户端
   send(connsocket); //给客户端返回数据，只能同时处理一个客户端
}
```

实现网络通信流程如下图
![img_3.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_3.png)

基础socket模型，能够实现服务器端和客户端之间的通信，但是程序每调用一次 accept 函数，只能处理一个客户端连接，当有大量的客户端连接时，这种模型处理性能比较差。因此 Linux 提供了高性能的IO多路复用机制来解决这种困境。

在Linux中，操作系统提供了select、poll 和 epoll 三种 IO多路复用机制，我们主要围绕下面4个方面来分析三种多路复用机制实现的原理：

IO多路复用可以监听多少个socket？
IO多路复用可以监听socket里面的哪些事件？
IO多路复用如何感知已就绪的文件描述符fd？
IO多路复用如何实现网络通信？

### 3.1 select机制
select机制中一个重要的函数是 select()，函数有4个入参，返回一个整数，select()原型和参数详情如下：

```
/**
*  参数说明
*  监听的文件描述符数量__nfds、
*  被监听描述符的三个集合*__readfds,*__writefds和*__exceptfds
*  监听时阻塞等待的超时时长*__timeout
*  返回值：返回一个socket对应的文件描述符
   */
   int select(int __nfds, fd_set * __readfds, fd_set * __writefds, fd_set * __exceptfds, struct timeval * __timeout)
   
```
**select 可以监听多少个socket？**

答案：1024

**select可以监听socket 的哪些事件?**

答案：select() 函数有三个fd_set集合，表示监听的三类事件，分别是读数据事件(__readfds集合)、写数据事件(__writefds集合)和异常事件(__exceptfds集合)，当集合为NULL时，代表不需要处理对应的事件。

**select 如何感知已就绪的fd？**

答案：需要遍历fd集合，才能找到就绪的描述符。

**select 机制怎么实现网络通信？**

代码实现
```
int sock_fd,conn_fd; //监听socket和已连接socket的变量
sock_fd = socket() //创建socket
bind(sock_fd)   //绑定socket
listen(sock_fd) //在socket上进行监听，将socket转为监听socket

fd_set rset;  //被监听的描述符集合，关注描述符上的读事件
int max_fd = sock_fd

//初始化rset数组，使用FD_ZERO宏设置每个元素为0
FD_ZERO(&rset);
//使用FD_SET宏设置rset数组中位置为sock_fd的文件描述符为1，表示需要监听该文件描述符
FD_SET(sock_fd,&rset);

//设置超时时间
struct timeval timeout;
timeout.tv_sec = 3;
timeout.tv_usec = 0;
while(1) {
//调用select函数，检测rset数组保存的文件描述符是否已有读事件就绪，返回就绪的文件描述符个数
n = select(max_fd+1, &rset, NULL, NULL, &timeout);

//调用FD_ISSET宏，在rset数组中检测sock_fd对应的文件描述符是否就绪
if (FD_ISSET(sock_fd, &rset)) {
//如果sock_fd已经就绪，表明已有客户端连接；调用accept函数建立连接
conn_fd = accept();
//设置rset数组中位置为conn_fd的文件描述符为1，表示需要监听该文件描述符
FD_SET(conn_fd, &rset);
}

//依次检查已连接套接字的文件描述符
for (i = 0; i < maxfd; i++) {
     //调用FD_ISSET宏，在rset数组中检测文件描述符是否就绪
    if (FD_ISSET(i, &rset)) {
    //有数据可读，进行读数据处理
   }
  }
}
```
select实现网络通信流程如下图：
![img_4.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_4.png)

select 函数存在的不足

首先，select()函数对单个进程能监听的文件描述符数量是有限制的，它能监听的文件描述符个数由 __FD_SETSIZE 决定，默认值是 1024。

其次，当 select 函数返回后，需要遍历描述符集合，才能找到就绪的描述符。这个遍历过程会产生一定开销，从而降低程序的性能。

### 3.2 poll机制
poll 机制的主要函数是 poll() 函数，poll()函数原型定义

```
/**
* 参数 *__fds 是 pollfd 结构体数组，pollfd 结构体里包含了要监听的描述符，以及该描述符上要监听的事件类型
* 参数 __nfds 表示的是 *__fds 数组的元素个数
*  __timeout 表示 poll 函数阻塞的超时时间
   */
   int poll (struct pollfd *__fds, nfds_t __nfds, int __timeout);
   pollfd结构体的定义

   struct pollfd {
      int fd;         //进行监听的文件描述符
      short int events;       //要监听的事件类型
      short int revents;      //实际发生的事件类型
   };
```
pollfd 结构体中包含了三个成员变量 fd、events 和 revents，分别表示要监听的文件描述符、要监听的事件类型和实际发生的事件类型。

**poll 可以监听多少个socket？**

答案：自定义，但是需要系统能够承受

**poll 可以监听socket里面的哪些事件?**

pollfd 结构体中要监听和实际发生的事件类型，是通过以下三个宏定义来表示的，分别是 POLLRDNORM、POLLWRNORM 和 POLLERR，它们分别表示可读、可写和错误事件。

```
#define POLLRDNORM 0x040 //可读事件
#define POLLWRNORM 0x100 //可写事件
#define POLLERR 0x008 //错误事件
```
**poll 如何获取已就绪fd?**

答案：和select差不多，需要遍历fd集合，才能找到就绪的描述符。

**poll 机制怎么实现网络通信？**

poll实现代码
```
int sock_fd,conn_fd; //监听套接字和已连接套接字的变量
sock_fd = socket() //创建套接字
bind(sock_fd)   //绑定套接字
listen(sock_fd) //在套接字上进行监听，将套接字转为监听套接字

//poll函数可以监听的文件描述符数量，可以大于1024
#define MAX_OPEN = 2048

//pollfd结构体数组，对应文件描述符
struct pollfd client[MAX_OPEN];

//将创建的监听套接字加入pollfd数组，并监听其可读事件
client[0].fd = sock_fd;
client[0].events = POLLRDNORM;
maxfd = 0;

//初始化client数组其他元素为-1
for (i = 1; i < MAX_OPEN; i++)
   client[i].fd = -1;

while(1) {
    //调用poll函数，检测client数组里的文件描述符是否有就绪的，返回就绪的文件描述符个数
    n = poll(client, maxfd+1, &timeout);
    //如果监听套件字的文件描述符有可读事件，则进行处理
if (client[0].revents & POLLRDNORM) {
     //有客户端连接；调用accept函数建立连接
     conn_fd = accept();

       //保存已建立连接套接字
       for (i = 1; i < MAX_OPEN; i++){
         if (client[i].fd < 0) {
           client[i].fd = conn_fd; //将已建立连接的文件描述符保存到client数组
           client[i].events = POLLRDNORM; //设置该文件描述符监听可读事件
           break;
          }
       }
       maxfd = i; 
}

//依次检查已连接套接字的文件描述符
for (i = 1; i < MAX_OPEN; i++) {
   if (client[i].revents & (POLLRDNORM | POLLERR)) {
       //有数据可读或发生错误，进行读数据处理或错误处理
    }
  }
}
```
poll实现网络通信流程如下图：
![img_5.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_5.png)

poll机制解决了select的单个进程最大只能监听1024个socket的限制，但是并没有解决轮询获取就绪fd的问题。

### 3.3 epoll机制
epoll是2.6内核中提出，使用 epoll_event 结构体来记录待监听的fd及其监听的事件类型的。

epoll_event 结构体以及 epoll_data 结构体的定义
```
typedef union epoll_data
{
    ...
    int fd;  //记录文件描述符
     ...
} epoll_data_t;


struct epoll_event
{
    uint32_t events;  //epoll监听的事件类型
    epoll_data_t data; //应用程序数据
};
```
epoll的接口比较简单，一共有三个函数： 
int epoll_create(int size);
创建一个epoll的句柄，size用来告诉内核这个监听的数目一共有多大。epoll 实例内部维护了两个结构，分别是记录要监听的fd和已经就绪的fd，而对于已经就绪的文件描述符来说，它们会被返回给用户程序进行处理。
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
epoll的事件注册函数，epoll_ctl向 epoll对象中添加、修改或者删除感兴趣的事件，成功返回0，否则返回–1。此时需要根据errno错误码判断错误类型。它不同与select()是在监听事件时告诉内核要监听什么类型的事件，而是在这里先注册要监听的事件类型。epoll_wait方法返回的事件必然是通过 epoll_ctl添加到 epoll中的。
int epoll_wait(int epfd, struct epoll_event * events, int maxevents, int timeout);
等待事件的产生，类似于select()调用。参数events用来从内核得到事件的集合，maxevents是events集合的大小，且不大于epoll_create()时的size，参数timeout是超时时间（毫秒，0会立即返回，-1将不确定，也有说法说是永久阻塞）。函数返回需要处理的事件数目，返回0表示已超时，返回–1表示错误，需要检查 errno错误码判断错误类型。
关于epoll的ET和LT两种工作模式

epoll有两种工作模式：LT(水平触发)模式和ET(边缘触发)模式。

默认情况下，epoll采用 LT模式工作，可以处理阻塞和非阻塞socket，而上表中的 EPOLLET表示可以将一个事件改为 ET模式。ET模式的效率要比 LT模式高，它只支持非阻塞套接字。

ET模式与LT模式的区别
当一个新的事件到来时，ET模式下可以从 epoll_wait调用中获取到这个事件，可是如果这次没有把这个事件对应的套接字缓冲区处理完，在这个套接字没有新的事件再次到来时，在 ET模式下是无法再次从 epoll_wait调用中获取这个事件的；而 LT模式则相反，只要一个事件对应的套接字缓冲区还有数据，就总能从 epoll_wait中获取这个事件。因此，在 LT模式下开发基于 epoll的应用要简单一些，不太容易出错，而在 ET模式下事件发生时，如果没有彻底地将缓冲区数据处理完，则会导致缓冲区中的用户请求得不到响应。

epoll 可以监听多少个socket？

答案：自定义，但是需要系统能够承受

epoll 如何获取已就绪fd?

答案：epoll实例内部维护了两个结构，分别是记录要监听的fd和已经就绪的fd，可以监听就绪的fd


epllo如何实现网络通信？

代码实现
```
int sock_fd,conn_fd; //监听socket和已连接socket的变量
sock_fd = socket() //创建主动socket
bind(sock_fd)   //绑定socket
listen(sock_fd) //在socket进行监听，将socket转为监听socket

epfd = epoll_create(EPOLL_SIZE); //创建epoll实例，
//创建epoll_event结构体数组，保存socket对应文件描述符和监听事件类型    
ep_events = (epoll_event*)malloc(sizeof(epoll_event) * EPOLL_SIZE);

//创建epoll_event变量
struct epoll_event ee
//监听读事件
ee.events = EPOLLIN;
//监听的文件描述符是刚创建的监听socket
ee.data.fd = sock_fd;

//将监听socket加入到监听列表中    
epoll_ctl(epfd, EPOLL_CTL_ADD, sock_fd, &ee);

while (1) {
//等待返回已经就绪的描述符
n = epoll_wait(epfd, ep_events, EPOLL_SIZE, -1);
//遍历所有就绪的描述符     
for (int i = 0; i < n; i++) {
      //如果是监听socket描述符就绪，表明有一个新客户端连接到来
     if (ep_events[i].data.fd == sock_fd) {
        conn_fd = accept(sock_fd); //调用accept()建立连接
        ee.events = EPOLLIN;  
        ee.data.fd = conn_fd;
        //添加对新创建的已连接socket描述符的监听，监听后续在已连接socket上的读事件      
        epoll_ctl(epfd, EPOLL_CTL_ADD, conn_fd, &ee);

       } else { //如果是已连接socket描述符就绪，则可以读数据
           ...//读取数据并处理
       }
    }
}
```
epoll 进行网络通信的流程如下图：
![img_6.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_6.png)


**三者的差异**
| IO多路复用机制        | 监听文件描述符最大限制           | 如何查找就绪的文件描述符  |
| ------------- |:-------------:| -----:|
| select      | 1024 | 遍历文件描述符集合 |
| poll      | 自定义      |   遍历文件描述符集合 |
| epoll | 自定义      |    epoll_wait返回就绪的文件描述符 |

实现网络通信的对照图，方便大家看出差异点
![img_7.png](https://www.yuanjava.cn/assets/md/iomultiplexing/img_7.png)

实现网络通信的对照图

## 4. 使用IO多路复用的技术框架
   redis：Redis 的ae_select.c和ae_epoll.c文件，就分别使用了 select 和 epoll 这两种机制，实现 IO 多路复用；

nginx：Nginx支持epoll、select、kqueue等不同操作系统下的各种IO多路复用方式；Nginx是通过 ET模式使用 epoll。

Reactor框架，netty：无论 C++ 还是 Java，在高性能的网络编程框架的编写上，大多数都是基于 Reactor 模式，其中最为典型的便是 Java 的 Netty 框架，而 Reactor 模式是基于 IO 多路复用的；

IO多路复用讲解完毕，因为IO多路复用模型对于理解Redis，Nginx等高性能框架太有帮助，所以建议大家参照源码，多多揣摩。有过有疑问也可以加我微信：MrWeiki，欢迎一起探讨，一起进步。


>
> 本文为原创文章，转载请标明出处。
>
> 本文链接：https://www.yuanjava.cn/linux/2022/01/01/iomultiplexing.html
>
>本文出自猿[java的博客](https://www.yuanjava.cn)

## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 欢迎关注公众号：猿java