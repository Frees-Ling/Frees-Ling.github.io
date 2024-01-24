---
title: How to upgrade winget itself
pubDatetime: 2023-10-03T02:39:00.000Z
modDatetime:
slug: upgrade-winget-itself
featured: false
draft: false
tags:
  - Tech
  - Windows
  - Tips
description: This tutorial will show you how to upgrade winget itself on Windows without uninstalling the old version.
language: en
---

First, open the **[Release Page](https://github.com/microsoft/winget-cli/releases)** of [microsoft/winget-cli](https://github.com/microsoft/winget-cli/) GitHub Repository, grab the latest download link with ".msixbundle" extension, and copy it to your clipboard.

> You just need to copy the download link without downloading it.

Remember, if you're on your production environment, please don't install the releases with "Pre-release" lable. Such releases can be buggy and may encounter unusual errors & issues.

![A screenshot from winget-cli GitHub Release Page](../../assets/images/how-to-upgrade-winget-itself/2023100302320173.png)

Turn up **Windows Terminal (Administrator)** with **PowerShell**.

![PowerShell screenshot (with Administrator)](../../assets/images/how-to-upgrade-winget-itself/2023100302284921.png)

Type in the following command. Remember to replace `URI-TO-YOUR-PREV-COPIED LINK` with your copied link.

```powershell
PS C:\Users\WrOffi> Add-AppxPackage -Path 'URI-TO-YOUR-PREV-COPIED LINK'
PS C:\Users\WrOffi> # Example: Add-AppxPackage -Path 'https://github.com/microsoft/winget-cli/releases/download/v1.6.2721/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle'
```

After that, the App Installer will automatically finish the following task.

![Screenshot of installing winget latest version with PowerShell](../../assets/images/how-to-upgrade-winget-itself/2023100302282934.png)

Finally, you can check the version of winget with the following command.

```powershell
PS C:\Users\WrOffi> winget --version
v1.6.2721
```
