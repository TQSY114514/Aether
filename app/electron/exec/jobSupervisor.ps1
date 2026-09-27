# ─────────────────────────────────────────────────────────────────────────────
# jobSupervisor.ps1 — Windows Kernel Job Object Isolation Supervisor
#
# Creates a Win32 Job Object with:
#   - JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000): Automatically kills all
#     child processes when this supervisor process or Aether exits/dies.
#   - JOB_OBJECT_LIMIT_PROCESS_MEMORY (0x0100): Caps per-process memory to 2GB.
#
# Communication via STDIN / STDOUT:
#   ASSIGN <pid> -> OK <pid> / ERR <pid> <message>
#   PING         -> PONG
#   QUIT         -> Exit
# ─────────────────────────────────────────────────────────────────────────────

param(
    [long]$MemoryLimitBytes = 2147483648 # 2 GB default
)

$ErrorActionPreference = 'Stop'

$csharp = @'
using System;
using System.Runtime.InteropServices;

public static class JobObjectNative {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryLimit;
        public UIntPtr PeakJobMemoryLimit;
    }

    public const int JobObjectExtendedLimitInformation = 9;
    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    public const uint JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x0100;
    public const uint PROCESS_SET_QUOTA = 0x0100;
    public const uint PROCESS_TERMINATE = 0x0001;

    private static IntPtr _hJob = IntPtr.Zero;

    public static bool Initialize(ulong memoryLimitBytes) {
        _hJob = CreateJobObject(IntPtr.Zero, null);
        if (_hJob == IntPtr.Zero) return false;

        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (memoryLimitBytes > 0) {
            info.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            info.ProcessMemoryLimit = new UIntPtr(memoryLimitBytes);
        }

        int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr pInfo = Marshal.AllocHGlobal(length);
        try {
            Marshal.StructureToPtr(info, pInfo, false);
            return SetInformationJobObject(_hJob, JobObjectExtendedLimitInformation, pInfo, (uint)length);
        } finally {
            Marshal.FreeHGlobal(pInfo);
        }
    }

    public static bool Assign(int pid, out int lastError) {
        lastError = 0;
        if (_hJob == IntPtr.Zero) { lastError = -1; return false; }
        IntPtr hProc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
        if (hProc == IntPtr.Zero) {
            lastError = Marshal.GetLastWin32Error();
            return false;
        }
        try {
            bool ok = AssignProcessToJobObject(_hJob, hProc);
            if (!ok) lastError = Marshal.GetLastWin32Error();
            return ok;
        } finally {
            CloseHandle(hProc);
        }
    }

    public static void Close() {
        if (_hJob != IntPtr.Zero) {
            CloseHandle(_hJob);
            _hJob = IntPtr.Zero;
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $csharp
    $ok = [JobObjectNative]::Initialize([UInt64]$MemoryLimitBytes)
    if (-not $ok) {
        [Console]::Error.WriteLine("Failed to initialize JobObject")
        exit 1
    }
    [Console]::Out.WriteLine("READY")
    [Console]::Out.Flush()
} catch {
    [Console]::Error.WriteLine("Add-Type failed: $_")
    exit 1
}

# Main command dispatch loop reading from STDIN
try {
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) {
            # STDIN closed (parent exited or closed pipe)
            break
        }
        $line = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        if ($line.StartsWith("ASSIGN ")) {
            $pidStr = $line.Substring(7).Trim()
            $targetPid = 0
            if ([int]::TryParse($pidStr, [ref]$targetPid)) {
                $errCode = 0
                $assigned = [JobObjectNative]::Assign($targetPid, [ref]$errCode)
                if ($assigned) {
                    [Console]::Out.WriteLine("OK $targetPid")
                } else {
                    [Console]::Out.WriteLine("ERR $targetPid Failed to assign to job (Win32Error: $errCode)")
                }
            } else {
                [Console]::Out.WriteLine("ERR $pidStr Invalid PID format")
            }
            [Console]::Out.Flush()
        } elseif ($line -eq "PING") {
            [Console]::Out.WriteLine("PONG")
            [Console]::Out.Flush()
        } elseif ($line -eq "QUIT") {
            break
        } else {
            [Console]::Out.WriteLine("ERR Unknown command: $line")
            [Console]::Out.Flush()
        }
    }
} finally {
    [JobObjectNative]::Close()
}
