---
title: YOLO训练中产生的问题及解决方案
published: 2026-03-08
description: '本文档主要介绍了在YOLO训练过程中可能遇到的问题及其解决方案，适用于计算机视觉领域的研究人员和开发者。'
image: ''
tags: [YOLO, 训练问题, 解决方案, 计算机视觉]
category: 'Note'
draft: false 
lang: ''
---
# 前言
本文配置环境如下
```bash
GPU：RTX5060 Laptop
CPU：AMD Ryzen9 8945HX
System：Windows 11
```
由于系统环境配置极其复杂和相关文档很少很少，而且对于新显卡（RTX 50系列），市面上常规方案并不能很好的适配，所以笔者研究出本文通用，百分百解决问题的方案**以供参考**
# 错误原因和错误重现
在YOLO训练中，我们通过使用`Ultralytics`的YOLO模型来进行训练，以下是测试训练项目架构
```plaintext
yolo/
│
├─ .venv/                # 虚拟环境
├─ dataset/              # 数据集
│   ├─ images/
│   │   ├─ train/
│   │   └─ val/
│   └─ labels/
│       ├─ train/
│       └─ val/
│
├─ models/               # 保存训练后的模型
│
├─ configs/
│   └─ data.yaml      # 数据集配置
│
├─ train.py              # 训练脚本
├─ detect.py             # 推理脚本
├─ .gitignore            
└─ README.md
```
训练脚本
```python
# ==============================================================
# File: train
# Author: Frees Ling
# Created: 2026/3/8
# Description: 
# Version: 1.0
# ==============================================================
# from ultralytics import YOLO
# import torch
#
# def main():
#     # 检查 GPU
#     print("CUDA available:", torch.cuda.is_available())
#     if torch.cuda.is_available():
#         print("GPU:", torch.cuda.get_device_name(0))
#
#     # 加载预训练模型（推荐从小模型开始）
#     model = YOLO("yolov8n.pt")
#
#     # 开始训练
#     results = model.train(
#         data="data.yaml",      # 数据集配置文件
#         epochs=50,             # 训练轮数
#         imgsz=640,             # 图片尺寸
#         batch=16,              # batch size
#         device=0,              # 使用GPU (0表示第一张显卡)
#         workers=8,             # 数据加载线程
#         project="runs/train",  # 输出目录
#         name="yolo_custom",    # 本次训练名称
#         cache=True,            # 缓存数据集
#         amp=True               # 混合精度训练（GPU会更快）3
#     )
#
# if __name__ == "__main__":
#     main()
from ultralytics import  YOLO

model = YOLO("yolov8n.pt")

results = model.train(
    data = "data.yaml",
    epochs = 10,
    imgsz = 640,
    batch = 16,
    device = 0,
    workers = 12,
    project = "runs/train",
    name = "test",
    cache = True,
    amp = True
    # batch = 24
    # workers = 12
    # imgsz = 640
    # cache = True
    # amp = True
)
```
按照一般教程的环境安装方法，是下面这样的
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```
测试是这么做的
```python
import torch

print(torch.__version__)
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0))
```
如果输出是这样的，那么就完成了
```bash
True
NVIDIA GeForce RTX 5060 Laptop GPU
```
但是事实上，我们的输出还真的是这样的，但是这种方法只适用于以往的显卡，并不适用新显卡（50系列），所以训练的时候会报以下错误
```bash

C:\Users\lenovo\Desktop\YOLO.venv\Scripts\python.exe C:\Users\lenovo\Desktop\YOLO\train.py
WARNING torchvision==0.20 is incompatible with torch==2.6.
Run 'pip install torchvision==0.21' to fix torchvision or 'pip install -U torch torchvision' to update both.
For a full compatibility table see https://github.com/pytorch/vision#installation
C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\cuda_init_.py:235: UserWarning:
NVIDIA GeForce RTX 5060 Laptop GPU with CUDA capability sm_120 is not compatible with the current PyTorch installation.
The current PyTorch install supports CUDA capabilities sm_50 sm_60 sm_61 sm_70 sm_75 sm_80 sm_86 sm_90.
If you want to use the NVIDIA GeForce RTX 5060 Laptop GPU GPU with PyTorch, please check the instructions at https://pytorch.org/get-started/locally/
warnings.warn(
Ultralytics 8.4.21 Python-3.10.11 torch-2.6.0.dev20241112+cu121 CUDA:0 (NVIDIA GeForce RTX 5060 Laptop GPU, 8151MiB)
engine\trainer: agnostic_nms=False, amp=True, angle=1.0, augment=False, auto_augment=randaugment, batch=16, bgr=0.0, box=7.5, cache=True, cfg=None, classes=None, close_mosaic=10, cls=0.5, compile=False, conf=None, copy_paste=0.0, copy_paste_mode=flip, cos_lr=False, cutmix=0.0, data=data.yaml, degrees=0.0, deterministic=True, device=0, dfl=1.5, dnn=False, dropout=0.0, dynamic=False, embed=None, end2end=None, epochs=10, erasing=0.4, exist_ok=False, fliplr=0.5, flipud=0.0, format=torchscript, fraction=1.0, freeze=None, half=False, hsv_h=0.015, hsv_s=0.7, hsv_v=0.4, imgsz=640, int8=False, iou=0.7, keras=False, kobj=1.0, line_width=None, lr0=0.01, lrf=0.01, mask_ratio=4, max_det=300, mixup=0.0, mode=train, model=yolov8n.pt, momentum=0.937, mosaic=1.0, multi_scale=0.0, name=test, nbs=64, nms=False, opset=None, optimize=False, optimizer=auto, overlap_mask=True, patience=100, perspective=0.0, plots=True, pose=12.0, pretrained=True, profile=False, project=runs/train, rect=False, resume=False, retina_masks=False, rle=1.0, save=True, save_conf=False, save_crop=False, save_dir=C:\Users\lenovo\Desktop\YOLO\runs\detect\runs\train\test, save_frames=False, save_json=False, save_period=-1, save_txt=False, scale=0.5, seed=0, shear=0.0, show=False, show_boxes=True, show_conf=True, show_labels=True, simplify=True, single_cls=False, source=None, split=val, stream_buffer=False, task=detect, time=None, tracker=botsort.yaml, translate=0.1, val=True, verbose=True, vid_stride=1, visualize=False, warmup_bias_lr=0.1, warmup_epochs=3.0, warmup_momentum=0.8, weight_decay=0.0005, workers=12, workspace=None
Overriding model.yaml nc=80 with nc=1
               from  n    params  module                                       arguments                       
0 -1 1 464 ultralytics.nn.modules.conv.Conv [3, 16, 3, 2]
1 -1 1 4672 ultralytics.nn.modules.conv.Conv [16, 32, 3, 2]
2 -1 1 7360 ultralytics.nn.modules.block.C2f [32, 32, 1, True]
3 -1 1 18560 ultralytics.nn.modules.conv.Conv [32, 64, 3, 2]
4 -1 2 49664 ultralytics.nn.modules.block.C2f [64, 64, 2, True]
5 -1 1 73984 ultralytics.nn.modules.conv.Conv [64, 128, 3, 2]
6 -1 2 197632 ultralytics.nn.modules.block.C2f [128, 128, 2, True]
7 -1 1 295424 ultralytics.nn.modules.conv.Conv [128, 256, 3, 2]
8 -1 1 460288 ultralytics.nn.modules.block.C2f [256, 256, 1, True]
9 -1 1 164608 ultralytics.nn.modules.block.SPPF [256, 256, 5]
10 -1 1 0 torch.nn.modules.upsampling.Upsample [None, 2, 'nearest']
11 [-1, 6] 1 0 ultralytics.nn.modules.conv.Concat [1]
12 -1 1 148224 ultralytics.nn.modules.block.C2f [384, 128, 1]
13 -1 1 0 torch.nn.modules.upsampling.Upsample [None, 2, 'nearest']
14 [-1, 4] 1 0 ultralytics.nn.modules.conv.Concat [1]
15 -1 1 37248 ultralytics.nn.modules.block.C2f [192, 64, 1]
16 -1 1 36992 ultralytics.nn.modules.conv.Conv [64, 64, 3, 2]
17 [-1, 12] 1 0 ultralytics.nn.modules.conv.Concat [1]
18 -1 1 123648 ultralytics.nn.modules.block.C2f [192, 128, 1]
19 -1 1 147712 ultralytics.nn.modules.conv.Conv [128, 128, 3, 2]
20 [-1, 9] 1 0 ultralytics.nn.modules.conv.Concat [1]
21 -1 1 493056 ultralytics.nn.modules.block.C2f [384, 256, 1]
22 [15, 18, 21] 1 751507 ultralytics.nn.modules.head.Detect [1, 16, None, [64, 128, 256]]
Model summary: 130 layers, 3,011,043 parameters, 3,011,027 gradients, 8.2 GFLOPs
Transferred 319/355 items from pretrained weights
Traceback (most recent call last):
File "C:\Users\lenovo\Desktop\YOLO\train.py", line 40, in <module>
results = model.train(
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\ultralytics\engine\model.py", line 777, in train
self.trainer.train()
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\ultralytics\engine\trainer.py", line 244, in train
self._do_train()
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\ultralytics\engine\trainer.py", line 366, in _do_train
self._setup_train()
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\ultralytics\engine\trainer.py", line 295, in _setup_train
self.model = self.model.to(self.device)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 1344, in to
return self._apply(convert)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\ultralytics\nn\tasks.py", line 288, in _apply
self = super()._apply(fn)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 904, in _apply
module._apply(fn)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 904, in _apply
module._apply(fn)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 904, in _apply
module._apply(fn)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 931, in _apply
param_applied = fn(param)
File "C:\Users\lenovo\Desktop\YOLO.venv\lib\site-packages\torch\nn\modules\module.py", line 1330, in convert
return t.to(
RuntimeError: CUDA error: no kernel image is available for execution on the device
CUDA kernel errors might be asynchronously reported at some other API call, so the stacktrace below might be incorrect.
For debugging consider passing CUDA_LAUNCH_BLOCKING=1
Compile with TORCH_USE_CUDA_DSA to enable device-side assertions.</module>
进程已结束，退出代码为 1
```
这个错误报的也很明确，就是显卡太新了，你的`CUDA`和`Pytorch`版本不匹配
> 有意思的是，这个问题的解决方案我居然什么地方都找不到

在苦苦折磨了两天之后，我开始思考，这个问题为什么会无法解决，以至于不论什么AI都无法给到我完美的GPU训练方案，基本上都是让我使用CPU训练
> CPU训练，训练一轮在十万大体量数据集里需要至少五个小时，甚至更久，仅仅五十轮迭代就需要十天，所以寻找GPU训练的方案刻不容缓

> 题外话：明明问题已经很明确了，但是迟迟给不到有效的解决方案，这也说明了当代大众AI的一个弊端，并不具有独立思考能力，但是一想，也蛮恐怖的，如果真的会自己思考了，未来，会变得怎么样呢？

# 解决方案
> **严格注意：本解决方案目前完美适用RTX50系列的显卡，并且一定要严格按照教程执行，否则容易引发烧显卡等非常严重的问题**

首先根据错误报告理解为什么会报错，在YOLO的训练中，我们不难发现，我们所用的显卡对应安装的CUDA版本和Python安装的PyTorch版本是一一对应的，所以这既是解决办法也是问题的根源所在，我们下载的PyTorch版本和CUDA版本必须一一对应
**以下是相关网站链接**
- [PyTorch官网](https://pytorch.org/get-started/locally/)
> PyTorch<br>
> 根据自身电脑安装对应的PyTorch版本

如果找不到对应版本，还可以试一试安装旧版本↓
- [PyTorch旧版本](https://pytorch.org/get-started/previous-versions/)
> 例如：<br>
> 因为我下载的CUDA版本是3.0，所以我安装的PyTorch是13.0，这个不懂可以问AI

- [CUDA官网](https://developer.nvidia.com/cuda-toolkit-archive)
> CUDA Toolkit Archive<br>
> 根据你自身的电脑安装对应的CUDA版本

> 例如：<br>
> 我的电脑版本是Windows 11，RTX5060 Laptop，那么我需要下载的CUDA版本是CUDA 3.0

对于50系列的显卡，可能还需要安装一些驱动（更新），比如2026新的爆款游戏《生化危机：安魂曲》就需要更新驱动来支持
- [NVIDIA驱动下载](https://www.nvidia.com/en-us/geforce/drivers/)
  如果英语不好，当然也有中文网站
- [NVIDIA驱动下载（中文）](https://www.nvidia.cn/geforce/drivers/)
> GeGForce 驱动程序<br>
> 根据自身电脑填表选择需要安装的驱动

这里值得注意的是，在2026年初，出现了**新版本驱动更新后烧显卡**的情况，这里驱动选择需要非常注意，以下视频含有各个驱动更新的内容以及BUG，可以参考一二再下载所需要的驱动更新
- [NVIDIA驱动更新视频](https://space.bilibili.com/280017744/lists/285271?type=season)
# 后续训练
可以通过以下代码来参考是否完成训练（直接贴上去了，懒得改了，但是已经改成测试版本了）
```python
# ==============================================================
# File: train
# Author: Frees Ling
# Created: 2026/3/8
# Description: Robust training script that falls back to CPU if GPU CUDA
#              kernels are incompatible with the installed PyTorch.
# Version: 1.1
# ==============================================================
from ultralytics import YOLO
import torch
import traceback
import sys


def train():
    # Report CUDA availability and device details
    print("torch.__version__:", torch.__version__)
    cuda_available = torch.cuda.is_available()
    print("CUDA available:", cuda_available)
    if cuda_available:
        try:
            name = torch.cuda.get_device_name(0)
        except Exception:
            name = "<unknown>"
        try:
            cap = torch.cuda.get_device_capability(0)
        except Exception:
            cap = None
        print(f"GPU: {name} compute_capability={cap}")

    model = YOLO("yolov8n.pt")

    # Default training args (attempt GPU first if available)
    train_args = dict(
        data="data.yaml",
        epochs=1,#测试
        imgsz=640,
        batch=16,
        device=0 if cuda_available else 'cpu',
        workers=12,
        project="runs/train",
        name="test",
        cache='disk',
        amp=True if cuda_available else False,
    )

    print("Training args:", train_args)

    try:
        print("Starting training...")
        results = model.train(**train_args)
        print("Training finished successfully.")
        return results
    except Exception as e:
        # Inspect exception to decide whether to retry on CPU
        err_str = str(e)
        print("Training failed with exception:", err_str)

        # Heuristics to detect CUDA / kernel compatibility errors
        cuda_error_indicators = [
            'no kernel image',
            'not compatible',
            'cuda capability',
            'CUDA error',
            'cudaErrorNoKernelImageForDevice',
            'AcceleratorError',
        ]

        if any(ind.lower() in err_str.lower() for ind in cuda_error_indicators):
            print("Detected a CUDA compatibility/kernel error. Retrying on CPU with amp disabled...")
            train_args['device'] = 'cpu'
            train_args['amp'] = False
            # Lower workers on CPU to avoid too many threads (optional)
            if train_args.get('workers', 0) > 4:
                train_args['workers'] = 4
            print("Retry Training args:", train_args)
            try:
                results = model.train(**train_args)
                print("CPU training finished successfully.")
                return results
            except Exception as e2:
                print("Retry on CPU also failed:", e2)
                traceback.print_exc()
                sys.exit(1)
        else:
            # Not a recognized CUDA issue - re-raise with traceback
            traceback.print_exc()
            sys.exit(1)


if __name__ == "__main__":
    train()
```
如果成功，应该会显示类似输出↓
```bash
C:\Users\Lenovo\Desktop\Code\YOLO\.venv\Scripts\python.exe C:\Users\Lenovo\Desktop\Code\YOLO\train.py 
torch.__version__: 2.10.0+cu130
CUDA available: True
GPU: NVIDIA GeForce RTX 5070 Ti compute_capability=(12, 0)
Training args: {'data': 'data.yaml', 'epochs': 50, 'imgsz': 640, 'batch': 16, 'device': 0, 'workers': 12, 'project': 'runs/train', 'name': 'test', 'cache': 'disk', 'amp': True}
Starting training...
Ultralytics 8.4.21  Python-3.10.11 torch-2.10.0+cu130 CUDA:0 (NVIDIA GeForce RTX 5070 Ti, 16303MiB)
engine\trainer: agnostic_nms=False, amp=True, angle=1.0, augment=False, auto_augment=randaugment, batch=16, bgr=0.0, box=7.5, cache=disk, cfg=None, classes=None, close_mosaic=10, cls=0.5, compile=False, conf=None, copy_paste=0.0, copy_paste_mode=flip, cos_lr=False, cutmix=0.0, data=data.yaml, degrees=0.0, deterministic=True, device=0, dfl=1.5, dnn=False, dropout=0.0, dynamic=False, embed=None, end2end=None, epochs=50, erasing=0.4, exist_ok=False, fliplr=0.5, flipud=0.0, format=torchscript, fraction=1.0, freeze=None, half=False, hsv_h=0.015, hsv_s=0.7, hsv_v=0.4, imgsz=640, int8=False, iou=0.7, keras=False, kobj=1.0, line_width=None, lr0=0.01, lrf=0.01, mask_ratio=4, max_det=300, mixup=0.0, mode=train, model=yolov8n.pt, momentum=0.937, mosaic=1.0, multi_scale=0.0, name=test, nbs=64, nms=False, opset=None, optimize=False, optimizer=auto, overlap_mask=True, patience=100, perspective=0.0, plots=True, pose=12.0, pretrained=True, profile=False, project=runs/train, rect=False, resume=False, retina_masks=False, rle=1.0, save=True, save_conf=False, save_crop=False, save_dir=C:\Users\Lenovo\Desktop\Code\YOLO\runs\detect\runs\train\test, save_frames=False, save_json=False, save_period=-1, save_txt=False, scale=0.5, seed=0, shear=0.0, show=False, show_boxes=True, show_conf=True, show_labels=True, simplify=True, single_cls=False, source=None, split=val, stream_buffer=False, task=detect, time=None, tracker=botsort.yaml, translate=0.1, val=True, verbose=True, vid_stride=1, visualize=False, warmup_bias_lr=0.1, warmup_epochs=3.0, warmup_momentum=0.8, weight_decay=0.0005, workers=12, workspace=None
Overriding model.yaml nc=80 with nc=1

                   from  n    params  module                                       arguments                     
  0                  -1  1       464  ultralytics.nn.modules.conv.Conv             [3, 16, 3, 2]                 
  1                  -1  1      4672  ultralytics.nn.modules.conv.Conv             [16, 32, 3, 2]                
  2                  -1  1      7360  ultralytics.nn.modules.block.C2f             [32, 32, 1, True]             
  3                  -1  1     18560  ultralytics.nn.modules.conv.Conv             [32, 64, 3, 2]                
  4                  -1  2     49664  ultralytics.nn.modules.block.C2f             [64, 64, 2, True]             
  5                  -1  1     73984  ultralytics.nn.modules.conv.Conv             [64, 128, 3, 2]               
  6                  -1  2    197632  ultralytics.nn.modules.block.C2f             [128, 128, 2, True]           
  7                  -1  1    295424  ultralytics.nn.modules.conv.Conv             [128, 256, 3, 2]              
  8                  -1  1    460288  ultralytics.nn.modules.block.C2f             [256, 256, 1, True]           
  9                  -1  1    164608  ultralytics.nn.modules.block.SPPF            [256, 256, 5]                 
 10                  -1  1         0  torch.nn.modules.upsampling.Upsample         [None, 2, 'nearest']          
 11             [-1, 6]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 12                  -1  1    148224  ultralytics.nn.modules.block.C2f             [384, 128, 1]                 
 13                  -1  1         0  torch.nn.modules.upsampling.Upsample         [None, 2, 'nearest']          
 14             [-1, 4]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 15                  -1  1     37248  ultralytics.nn.modules.block.C2f             [192, 64, 1]                  
 16                  -1  1     36992  ultralytics.nn.modules.conv.Conv             [64, 64, 3, 2]                
 17            [-1, 12]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 18                  -1  1    123648  ultralytics.nn.modules.block.C2f             [192, 128, 1]                 
 19                  -1  1    147712  ultralytics.nn.modules.conv.Conv             [128, 128, 3, 2]              
 20             [-1, 9]  1         0  ultralytics.nn.modules.conv.Concat           [1]                           
 21                  -1  1    493056  ultralytics.nn.modules.block.C2f             [384, 256, 1]                 
 22        [15, 18, 21]  1    751507  ultralytics.nn.modules.head.Detect           [1, 16, None, [64, 128, 256]] 
Model summary: 130 layers, 3,011,043 parameters, 3,011,027 gradients, 8.2 GFLOPs

Transferred 319/355 items from pretrained weights
Freezing layer 'model.22.dfl.conv.weight'
AMP: running Automatic Mixed Precision (AMP) checks...
AMP: checks passed 
train: Fast image access  (ping: 0.10.1 ms, read: 831.1733.7 MB/s, size: 72.1 KB)
train: Scanning C:\Users\Lenovo\Desktop\Code\YOLO\train\labels.cache... 98798 images, 140 backgrounds, 0 corrupt: 100% ━━━━━━━━━━━━ 98798/98798  0.0s
train: Caching images (69.5GB Disk): 100% ━━━━━━━━━━━━ 98798/98798 15.2Kit/s 6.5s
val: Fast image access  (ping: 0.00.0 ms, read: 331.4105.1 MB/s, size: 18.5 KB)
val: Scanning C:\Users\Lenovo\Desktop\Code\YOLO\valid\labels.cache... 2048 images, 3 backgrounds, 0 corrupt: 100% ━━━━━━━━━━━━ 2048/2048  0.0s
val: Caching images (1.5GB Disk): 100% ━━━━━━━━━━━━ 2048/2048 11.3Kit/s 0.2s
optimizer: 'optimizer=auto' found, ignoring 'lr0=0.01' and 'momentum=0.937' and determining best 'optimizer', 'lr0' and 'momentum' automatically... 
optimizer: MuSGD(lr=0.01, momentum=0.9) with parameter groups 57 weight(decay=0.0), 64 weight(decay=0.0005), 63 bias(decay=0.0)
Plotting labels to C:\Users\Lenovo\Desktop\Code\YOLO\runs\detect\runs\train\test\labels.jpg... 
Image sizes 640 train, 640 val
Using 12 dataloader workers
Logging results to C:\Users\Lenovo\Desktop\Code\YOLO\runs\detect\runs\train\test
Starting training for 50 epochs...

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
       1/50      2.07G      1.149     0.9735      1.119         32        640: 100% ━━━━━━━━━━━━ 6175/6175 4.1it/s 25:10
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 64/64 6.0it/s 10.6s
                   all       2048       2195      0.971      0.925      0.962      0.656

......
```
**以上，就是关于YOLO训练中新显卡存在的问题解决办法**