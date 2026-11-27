$ErrorActionPreference = 'Stop'
# Capture the public peer certificate while retaining Windows TLS validation.
# No HTTP request, credentials, trust-store edits or business actions.
Add-Type -TypeDefinition @'
using System;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
public static class ErpPeerCertificate {
    public static X509Certificate2 Peer;
    public static SslPolicyErrors PolicyErrors;
    public static bool Validated;
    public static void Inspect(string hostname, int port) {
        using (var tcp = new TcpClient()) {
            if (!tcp.ConnectAsync(hostname, port).Wait(10000)) throw new Exception("Connection timeout");
            using (var ssl = new SslStream(tcp.GetStream(), false, (sender, certificate, chain, errors) => {
                Peer = certificate == null ? null : new X509Certificate2(certificate);
                PolicyErrors = errors;
                return errors == SslPolicyErrors.None;
            })) {
                tcp.ReceiveTimeout = 10000;
                tcp.SendTimeout = 10000;
                try { ssl.AuthenticateAsClient(hostname); Validated = true; }
                catch (System.Security.Authentication.AuthenticationException) { Validated = false; }
            }
        }
    }
}
'@
try {
    $target = [Uri]$env:EPICOR_BASE_URL
    [ErpPeerCertificate]::Inspect($target.DnsSafeHost, $target.Port)
    $peer = [ErpPeerCertificate]::Peer
    if ($null -eq $peer) { throw 'No certificate observed' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($sha.ComputeHash($peer.RawData)).Replace('-', ':') }
    finally { $sha.Dispose() }
    $evidencePath = [IO.Path]::GetFullPath('.runtime/observed-erp-peer.cer')
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($evidencePath)) | Out-Null
    [IO.File]::WriteAllBytes($evidencePath, $peer.RawData)
    [ordered]@{
        windowsTlsValidated = [ErpPeerCertificate]::Validated
        windowsPolicyErrors = [ErpPeerCertificate]::PolicyErrors.ToString()
        peerSha256 = $fingerprint
        subject = $peer.Subject
        issuer = $peer.Issuer
        expiresUtc = $peer.NotAfter.ToUniversalTime().ToString('o')
        publicCertificateEvidence = '.runtime/observed-erp-peer.cer'
        trustSettingsChanged = $false
    } | ConvertTo-Json -Compress
} catch {
    Write-Output 'Windows peer-certificate inspection failed; details withheld. No trust settings changed.'
    exit 1
}
