Option Explicit

Dim fso, sh, rootDir, appDir, electronExe, distIndex, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.BuildPath(rootDir, "app")
electronExe = fso.BuildPath(appDir, "node_modules\electron\dist\electron.exe")
distIndex = fso.BuildPath(appDir, "dist\index.html")

If Not fso.FileExists(electronExe) Or Not fso.FileExists(distIndex) Then
  ' First-time setup or missing build: run start.bat to install/build cleanly
  sh.CurrentDirectory = rootDir
  sh.Run """" & fso.BuildPath(rootDir, "start.bat") & """", 1, False
Else
  ' Launch Electron directly without opening a console window (window style 0 = hidden)
  sh.CurrentDirectory = appDir
  cmd = """" & electronExe & """ ."
  sh.Run cmd, 0, False
End If
