$ErrorActionPreference='Stop'
try {
 [void][Reflection.Assembly]::LoadWithPartialName('System.Security')
 $action=[Console]::In.ReadLine()
 $value=[Console]::In.ReadToEnd()
 if($action -eq 'protect') {
  $data=[Text.Encoding]::UTF8.GetBytes($value)
  $cipher=[Security.Cryptography.ProtectedData]::Protect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($cipher))
 } elseif($action -eq 'unprotect') {
  $data=[Convert]::FromBase64String($value)
  $clear=[Security.Cryptography.ProtectedData]::Unprotect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))
 } else {exit 1}
} catch { [Console]::Error.Write('Windows protection operation failed');exit 1 }
