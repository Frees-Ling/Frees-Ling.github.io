---
layout: post
title: git rebase和merge的区别
category: java
tags: [java]
excerpt: Git是目前多版本控制的一个主力工具，当把远程分支合到本地时，你知道git merge和git rebase有什么区别吗？
--- 

你好，我是Weiki，欢迎来到猿java。

最近和几个小伙伴在基于github私有仓库进行开发，在把远程master合并到本地分支时，很习惯了使用了git merge，结果小伙伴们说他们的是使用git rebase的，因此特定去比较了两者的区别：

比如： A，B都从 master分支的的同一个commit点：bb99d  拉出两个新分支
A： 分支名 xxx_a
B： 分支名 xxx_b

然后A，B在各自的代码开发，如果A先commit，并且把代码push到了master，commit点是 b9223e6，

此时B需要提交代码，需要先把master上最新代码拉下来，有两个操作：

## **git rebase**
```shell
git rebase origin master
```
该指令会把A提交的点b9223e6作为B的新起点，整体呈一条直线，如下图：

![img.png](https://www.yuanjava.cn/assets/md/git/rebase.png)


## **git merge**
```shell
git merge origin master
```
该指令执行后，B分支的提交点还是刚从master拉取分支时的bb99d，A，B各有一条提交线，如下图

![img.png](https://www.yuanjava.cn/assets/md/git/merge.png)

## **最后**

如果想要一个干净的，没有merge commit的线性历史树，那么你应该选择git rebase，如果想保留完整的历史记录，并且想要避免重写commit history的风险，你应该选择使用git merge

**建议**
企业级使用 建议git merge，可以看出各个提交分支的历史； 个人学习什么的可以git rebase，分支少，清爽

>
> 本文为原创文章，转载请标明出处。
>
> 本文链接：https://www.yuanjava.cn/java/2022/04/22/gitrebase.html
>
>本文出自猿[java的博客](https://www.yuanjava.cn)


## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
