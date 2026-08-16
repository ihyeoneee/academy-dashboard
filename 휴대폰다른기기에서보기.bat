@echo off
chcp 65001 >nul
echo 관리자 권한 확인 창(UAC)이 뜨면 '예'를 눌러주세요.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1" -Root "%~dp0" -Port 8791 -Lan
