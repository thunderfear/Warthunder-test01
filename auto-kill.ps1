#Requires -Version 5.1
<#
.SYNOPSIS
    战雷项目进程自动清理脚本（跨 Windows 版本通用）
.DESCRIPTION
    自动检测并杀死占用指定端口的闲置进程。
    使用 PowerShell 原生 cmdlet，不依赖 netstat/taskkill 外部命令。
    兼容 Windows PowerShell 5.1 和 PowerShell Core 7+。

    判断逻辑：端口有进程监听但超过 1 小时无活跃 TCP 连接 → 自动 kill。

.PARAMETER Mode
    once  - 单次检查并清理（默认）
    watch - 后台持续监控，每 5 分钟检查一次
.PARAMETER Ports
    自定义监控端口列表，默认 @(3000, 5175, 5176)
.PARAMETER Timeout
    空闲超时阈值（秒），默认 3600（1 小时）
.PARAMETER Interval
    监控模式下检查间隔（秒），默认 300（5 分钟）
.EXAMPLE
    .\auto-kill.ps1
    .\auto-kill.ps1 -Mode watch
    .\auto-kill.ps1 -Ports 3000,8080 -Timeout 1800
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('once','watch')]
    [string]$Mode = 'once',

    [Parameter(Mandatory=$false)]
    [int[]]$Ports = @(3000, 5175, 5176),

    [Parameter(Mandatory=$false)]
    [int]$Timeout = 3600,

    [Parameter(Mandatory=$false)]
    [int]$Interval = 300
)

# ============================================================
# 全局状态：记录每个端口的最后活跃时间
# ============================================================
$portLastActive = @{}
foreach ($p in $Ports) {
    $portLastActive[$p] = Get-Date
}

# ============================================================
# 工具函数
# ============================================================

function Write-Log {
    <# 输出带时间戳的日志 #>
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $color = switch ($Level) {
        'INFO'    { 'Cyan' }
        'WARN'    { 'Yellow' }
        'ERROR'   { 'Red' }
        'KILL'    { 'Magenta' }
        default   { 'White' }
    }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

function Get-PortProcessIds {
    <#
    获取指定端口上正在监听的进程 PID 列表。
    优先使用 Get-NetTCPConnection（Win8+/PS5.1+），回退到 netstat 解析。
    #>
    param([int]$Port)
    $pids = @()

    # 方法1：Get-NetTCPConnection（PowerShell 原生，跨 Windows 版本通用）
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        foreach ($c in $conns) {
            if ($c.OwningProcess -gt 0) {
                $pids += $c.OwningProcess
            }
        }
        if ($pids.Count -gt 0) {
            return $pids | Select-Object -Unique
        }
    } catch {
        # Get-NetTCPConnection 不可用时，回退到 netstat
    }

    # 方法2：netstat 解析（兜底方案，所有 Windows 版本都支持）
    try {
        $lines = netstat -ano 2>$null
        foreach ($line in $lines) {
            if ($line -match 'LISTENING' -and $line -match ":${Port}[\s\t]") {
                $parts = $line.Trim() -split '[\s\t]+'
                $lastField = $parts[-1]
                if ($lastField -match '^\d+$' -and [int]$lastField -gt 0) {
                    $pids += [int]$lastField
                }
            }
        }
    } catch {
        Write-Log "检查端口 $Port 时出错: $_" -Level ERROR
    }

    return $pids | Select-Object -Unique
}

function Test-PortHasEstablished {
    <#
    检查指定端口是否存在 ESTABLISHED 状态的连接。
    优先使用 Get-NetTCPConnection，回退到 netstat。
    #>
    param([int]$Port)

    # 方法1：Get-NetTCPConnection
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Established -ErrorAction Stop
        return $conns.Count -gt 0
    } catch {
        # 回退到 netstat
    }

    # 方法2：netstat 解析
    try {
        $lines = netstat -ano 2>$null
        foreach ($line in $lines) {
            if ($line -match 'ESTABLISHED' -and $line -match ":${Port}[\s\t]") {
                return $true
            }
        }
    } catch {
        Write-Log "检查端口 $Port 连接状态时出错: $_" -Level ERROR
    }
    return $false
}

function Get-ProcInfo {
    <# 获取进程的简要信息（名称、启动时间），用于日志输出 #>
    param([int]$ProcId)
    try {
        $proc = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
        if ($proc) {
            return @{
                Name      = $proc.ProcessName
                StartTime = $proc.StartTime
                CPU       = [math]::Round($proc.CPU, 2)
            }
        }
    } catch { }
    return $null
}

function Invoke-KillProcess {
    <#
    强制终止指定 PID 的进程。
    优先使用 Stop-Process（PowerShell 原生，跨平台），回退到 taskkill。
    #>
    param([int]$ProcId)

    # 方法1：Stop-Process（PowerShell 原生）
    try {
        Stop-Process -Id $ProcId -Force -ErrorAction Stop
        Write-Log "已终止进程 PID=$ProcId (Stop-Process 成功)" -Level KILL
        return $true
    } catch {
        Write-Log "Stop-Process 失败: $_，尝试 taskkill..." -Level WARN
    }

    # 方法2：taskkill 兜底（Windows 传统命令）
    try {
        $null = & taskkill /PID $ProcId /F 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "已终止进程 PID=$ProcId (taskkill 成功)" -Level KILL
            return $true
        }
    } catch {
        # 忽略
    }

    Write-Log "终止进程 PID=$ProcId 失败：所有方法均无效" -Level ERROR
    return $false
}

# ============================================================
# 核心检查逻辑
# ============================================================

function Invoke-PortCheck {
    <#
    遍历所有目标端口，检查并清理闲置进程。
    判断逻辑：
      1. 端口无监听进程 → 跳过（无需清理）
      2. 端口有 ESTABLISHED 连接 → 视为活跃，重置计时
      3. 端口无 ESTABLISHED 连接且空闲超过阈值 → kill
    #>
    Write-Log "========== 开始检查端口状态 =========="

    foreach ($port in $Ports) {
        $procIds = Get-PortProcessIds -Port $port

        if ($procIds.Count -eq 0) {
            Write-Log "端口 $port : 无监听进程，跳过"
            # 重置该端口的活跃时间，避免下次误判
            $portLastActive[$port] = Get-Date
            continue
        }

        foreach ($procId in $procIds) {
            $info = Get-ProcInfo -ProcId $procId
            $procDesc = if ($info) {
                "$($info.Name) (启动于 $($info.StartTime.ToString('HH:mm:ss')))"
            } else {
                "未知进程"
            }

            # 检查是否有 ESTABLISHED 连接
            $hasActive = Test-PortHasEstablished -Port $port

            if ($hasActive) {
                # 有活跃连接，重置计时器
                $portLastActive[$port] = Get-Date
                Write-Log "端口 $port (PID=$procId, $procDesc) : 有活跃连接，状态正常"
            } else {
                # 无活跃连接，计算空闲时长
                $idleSeconds = ((Get-Date) - $portLastActive[$port]).TotalSeconds

                if ($idleSeconds -ge $Timeout) {
                    $idleMin = [math]::Round($idleSeconds / 60, 1)
                    Write-Log "端口 $port (PID=$procId, $procDesc) : 空闲 ${idleMin} 分钟，超过阈值 ${Timeout}秒，执行清理！" -Level WARN
                    Invoke-KillProcess -ProcId $procId
                    # kill 后重置计时器
                    $portLastActive[$port] = Get-Date
                } else {
                    $idleMin = [math]::Round($idleSeconds / 60, 1)
                    $timeoutMin = [math]::Round($Timeout / 60)
                    Write-Log "端口 $port (PID=$procId, $procDesc) : 无活跃连接，空闲 ${idleMin} 分钟（阈值 ${timeoutMin}分钟），继续观察" -Level WARN
                }
            }
        }
    }

    Write-Log "========== 检查完毕 =========="
}

# ============================================================
# 主入口
# ============================================================

Write-Log "战雷项目进程清理脚本启动"
$timeoutMin = [math]::Round($Timeout / 60)
$intervalMin = [math]::Round($Interval / 60)
Write-Log "运行模式: $Mode | 监控端口: $($Ports -join ', ') | 空闲阈值: ${Timeout}秒 (${timeoutMin}分钟) | 检查间隔: ${Interval}秒 (${intervalMin}分钟)"

# 检测 PowerShell 版本和网络 API 可用性
$psVersion = $PSVersionTable.PSVersion.ToString()
$hasNetCmdlet = $null -ne (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)
Write-Log "PowerShell 版本: $psVersion | Get-NetTCPConnection 可用: $hasNetCmdlet"

switch ($Mode) {
    'once' {
        # 单次检查模式：执行一次后退出
        Invoke-PortCheck
        Write-Log "单次检查完成，脚本退出。"
    }
    'watch' {
        # 持续监控模式：循环检查
        Write-Log "进入持续监控模式，每 ${Interval}秒 (${intervalMin}分钟) 检查一次。按 Ctrl+C 退出。"
        while ($true) {
            Invoke-PortCheck
            $nextCheck = (Get-Date).AddSeconds($Interval).ToString('HH:mm:ss')
            Write-Log "下次检查时间: $nextCheck"
            Start-Sleep -Seconds $Interval
        }
    }
}
