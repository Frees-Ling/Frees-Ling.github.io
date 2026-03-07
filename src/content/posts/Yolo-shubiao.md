---
title: YOLO新应用-数据标注篇
published: 2026-03-07
description: '本文主要介绍了YOLO在数据标注方面的新应用，适用于计算机视觉领域的研究人员和开发者。'
image: ''
tags: [YOLO, 数据标注, 计算机视觉]
category: 'Note'
draft: false 
lang: ''
---
# 前言
虽然说在本飞书文档知识库中已经有过相关文档了，理应来说不必再要我多此一举，但是经过笔者亲自试验，觉得难度十分巨大，不论从什么方面来说，都是十分失败的，不应成为教程使用，所以出此教程帮助想要使用YOLO的人跨越门槛，也能十分开心的使用YOLO
> 本文仅作为参考，有什么奇奇怪怪的问题自己去查

为了方便比较，我将旧版本的数据标注教程也一并放进来[YOLO数据标注](https://kimiyang.feishu.cn/wiki/F0sFwlSDEirjXbkE1rNcqWVwnIb?fromScene=spaceOverview)
> 本文基于对YOLO模型熟悉的前提下所写，不熟悉也没关系，我也会写的
> > 本文是基础入门，仅教基础的，若我还有时间，我估计也许会写进阶标注
# 是时候更新一下新技术了！
为什么说[YOLO数据标注](https://kimiyang.feishu.cn/wiki/F0sFwlSDEirjXbkE1rNcqWVwnIb?fromScene=spaceOverview)比较落后，原因有以下几个
- LabelImg对于高版本的Python并不支持，而随着YOLO模型的更新换代，所需要的Python版本也会逐渐升高，所需要的数据标注类型多样，不符合趋势
- LabelImg十分依赖于PyQt相关模块，不仅配置复杂，也是全英文界面，对于中文入门学习者十分的不友好，学习成本增加
- LabelImg已经不更新了，稳定性也在下降，虽然说你可能还可以下到LabelImg（因为还是有很多人去使用这个工具），但是对于未来学习者，会遇到很多无法解决的问题，而究其根本，就是因为版本的不匹配或者解释器的更新带来的各种疑难杂症
- LabelImg太容易崩溃了！！！！！！！！！！！！！！！！！！！！！！！！！！/(ㄒoㄒ)/~~

__综上，笔者在这里不得不秉弃LabelImg，转向其他数据标注方法__
# X-AnyLabeling
X-AnyLabeling是我目前找到的替代LabelImg最好的东西
```bash
Github仓库地址
https://github.com/CVHub520/X-AnyLabeling
```
```bash
下载地址
Github：https://github.com/CVHub520/X-AnyLabeling/releases/tag/v4.0.0-beta.2

如果没有梯子也是没有关系的，我这里已经贴心的帮你们下载好了
『来自123云盘VIP会员_FL_的分享』X-AnyLabeling 链接：https://www.123865.com/s/l2fqVv-0x2i
```
![](https://vip.123pan.cn/1816365004/yk6baz03t0m000dc7vrfy0vh91wj0tx4DIYPAqDzAIaOAcxvDdawDO==.png)
如上图所示，为其基本页面
> 由于一开始是英文界面，只需要在上面这一栏内找到`Language`选项，选择中文即可
# 入门使用
第一眼看上去比那个LabelImg高大上多了（bushi

首先准备好以下文件夹
1. 预备数据标注图片文件夹
2. 导出用的文件夹
3. 存放json格式的文件夹
> 为什么要三个呢，因为我更倾向于分分清楚，这样更直观
## 第一步：设置输入输出文件夹
- 首先点击文件，选择打开文件夹，这里选择的是你存放图片的文件夹
- 其次，还是点击文件，选择更改输出目录，这里选择的是你存放json格式的文件夹，因为你在这个软件每标注一个图片，都会生成对应的json文件，为了避免混淆，笔者建议单独设置
## 第二步：数据标注
由于是基础入门，本部分仅教用方框标注
上一步中我们已经导入了一个文件夹，在导入的时候，就已经自动加载了图片了，如下图
![](https://vip.123pan.cn/1816365004/yk6baz03t0l000dc7vrhs87pl2x409brDIYPAqDzAIaOAcxvDdawDO==.png)
我们选择左侧方框工具（或者直接“R”），如下图
![](https://vip.123pan.cn/1816365004/ymjew503t0l000dc7vo8slovgcw25ftdDIYPAqDzAIaOAcxvDdawDO==.png)
由于我这里仅作测试为主，所以识别主体是可乐（标签：COCO），直接点击OK，会变成紫色，如下图
![](https://vip.123pan.cn/1816365004/yk6baz03t0n000dc7vri8s5qowy80qesDIYPAqDzAIaOAcxvDdawDO==.png)
那么恭喜你，图片的数据标注你完成了
## 第三步：导出数据
以此类推，我们完成了全部的数据标注，就可以开始导出了
> 注意：完成全部的数据标注是右下角全部变成勾，并且按下一张没有反应

当我们点击导出的时候，肯定发懵了？！为什么一个YOLO导出会有这么多

其实当YOLO更新的时候，已经不再满足这种拉框的精度，所以会有更多例如点，线，多边形的标注，对应的导出方式和训练方式也不一样，在这里我们选择Hbb即可，会看到如下图
![](https://vip.123pan.cn/1816365004/yk6baz03t0m000dc7vri8s59m9xs0colDIYPAqDzAIaOAcxvDdawDO==.png)
在这里我们还需要打开一个文件（classes Files），即类别文件，就是我们数据标注了什么标签，就要在里面写什么标签，如下图
![](https://vip.123pan.cn/1816365004/ymjew503t0n000dc7vo92d5k2hw2p1t0DIYPAqDzAIaOAcxvDdawDO==.png)
```txt
我们标注的标签是 COCO
所以我们txt文本里面写的也是COCO
这个是导出我们想要的数据
```
选择好后，就如下图，选择一个空文件夹，进行导出
![](https://vip.123pan.cn/1816365004/ymjew503t0m000dc7vo995aho7w2xtttDIYPAqDzAIaOAcxvDdawDO==.png)
> 注意：要点击Save with images<br>
>不是多此一举，是为了更好的对应

然后一直点Yes，查看我们的导出文件
![](https://vip.123pan.cn/1816365004/ymjew503t0n000dc7vo92d5lurw2skfzDIYPAqDzAIaOAcxvDdawDO==.png)
符合我们训练需求，数据标注完成！

__本教程到此结束__