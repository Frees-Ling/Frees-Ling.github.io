---
layout: post
title: 如何在idea中将git多个commit合并成一个
category: java
tags: [java]
excerpt: 在使用Git做版本控制开发代码时，难免会出现多个commit，有些commit看起来不那么和谐，那么如何"隐藏"呢？
--- 


你好，我是Weiki，欢迎来到猿java。

最近工作中，因为涉及到多个分支的切换，所以在单个分支里面会出现了很多看起来比较low的commit历史，为了减少这部分的commit的视觉丑感，特意去研究了下在idea中如何可视化将多个commit合并成一个，如下图，先在idea上打开git提交的commit历史：

![img.png](https://www.yuanjava.cn/assets/md/mcommit/1.png)


然后选择一个commit，右键，选择 Interactively Rebase from Here. 如下图：

![img.png](https://www.yuanjava.cn/assets/md/mcommit/2.png)

把下面的那个unit test合并到上面的那个unit test，选中第二个unit test，右键，点击 Fixup，如下图：

![img.png](https://www.yuanjava.cn/assets/md/mcommit/3.png)

当第二个unit test 出现指向第一个unit test的向上箭头，代表上一步的Fixup操作成功，然后执行rebase如下图：

![img.png](https://www.yuanjava.cn/assets/md/mcommit/5.png)

最后，把合并后的commit push到远程分支，注意此处需要选择强制推送：Force Push，如下图

![img.png](https://www.yuanjava.cn/assets/md/mcommit/6.png)


合并完之后，就只有一个unit test的commit了

![img.png](https://www.yuanjava.cn/assets/md/mcommit/7.png)



## **最后**

合并commit可以隐藏很多自己不想被看到的commit显示，清爽commit提交注释，注意：此处只是屏蔽commit历史的显示，代码之类的不会受到影响



>
> 本文为原创文章，转载请标明出处。
>
> 本文链接：https://www.yuanjava.cn/java/2022/04/24/mergemcommit.html
>
>本文出自猿[java的博客](https://www.yuanjava.cn)

## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
