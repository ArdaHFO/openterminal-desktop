using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Windows.Forms;

internal static class Launcher
{
    const string WebUrl = "http://localhost:3000/";
    const string ApiUrl = "http://127.0.0.1:4000/api/status";
    static readonly string LogDir = Path.Combine(InstallPaths.Root, "data", "logs");

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--service") return RunService(args[1]);
        bool quiet = Array.IndexOf(args, "--no-browser") >= 0;
        if (quiet) return Launch(false, delegate { });
        Application.EnableVisualStyles();
        using (var window = new Form())
        {
            window.Text = "OpenTerminal";
            window.ClientSize = new System.Drawing.Size(440, 100);
            window.FormBorderStyle = FormBorderStyle.FixedDialog;
            window.MaximizeBox = false;
            window.StartPosition = FormStartPosition.CenterScreen;
            var label = new Label { Text = "OpenTerminal hazırlanıyor…", Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter };
            window.Controls.Add(label);
            int result = 0;
            window.Shown += async delegate {
                result = await Task.Run(() => Launch(true, message => {
                    if (!window.IsDisposed) try { window.BeginInvoke((Action)(() => label.Text = message)); } catch (InvalidOperationException) { }
                }));
                if (!window.IsDisposed) window.Close();
            };
            Application.Run(window);
            return result;
        }
    }

    internal static bool Listening(int port)
    {
        using (var socket = new TcpClient())
        {
            try { return socket.ConnectAsync("127.0.0.1", port).Wait(500) && socket.Connected; }
            catch { return false; }
        }
    }

    internal static string Read(string url)
    {
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Proxy = null;
        request.Timeout = 4000;
        request.ReadWriteTimeout = 4000;
        request.AllowAutoRedirect = false;
        using (var response = request.GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd();
    }

    internal static bool ApiReady(string url)
    {
        try {
            var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Read(url));
            return data.ContainsKey("service") && (string)data["service"] == "OpenTerminal" && data.ContainsKey("ok") && data["ok"] is bool && (bool)data["ok"];
        } catch { return false; }
    }

    internal static bool WebReady(string url)
    {
        try { return Read(url).Contains("<title>OpenTerminal"); } catch { return false; }
    }

    static void Log(string message)
    {
        try {
            Directory.CreateDirectory(LogDir);
            File.AppendAllText(Path.Combine(LogDir, "launcher.log"), DateTimeOffset.Now.ToString("o") + " " + message + Environment.NewLine);
        } catch { }
    }

    static void RequireFile(string path)
    {
        if (!File.Exists(path)) throw new IOException("Gerekli dosya bulunamadı: " + path + "\nUygulama klasörünü taşımayın veya silmeyin.");
    }

    static int Launch(bool browser, Action<string> progress)
    {
        try {
            using (var gate = new Mutex(false, @"Local\OpenTerminal.Desktop.Start"))
            {
                bool acquired = false;
                try {
                    progress("Servisler kontrol ediliyor…");
                    try { acquired = gate.WaitOne(TimeSpan.FromMinutes(3)); } catch (AbandonedMutexException) { acquired = true; }
                    if (!acquired) throw new TimeoutException("Başka bir OpenTerminal açılışı sürüyor. Biraz sonra tekrar deneyin.");
                    RequireFile(InstallPaths.Node);
                    RequireFile(Path.Combine(InstallPaths.Root, "server", "node_modules", "tsx", "dist", "cli.mjs"));
                    RequireFile(Path.Combine(InstallPaths.Root, "web", "node_modules", "next", "dist", "bin", "next"));
                    Directory.CreateDirectory(LogDir);
                    bool api = ApiReady(ApiUrl), web = WebReady(WebUrl);
                    // Check both ports before starting anything. Never stop an unknown service.
                    if (!api && Listening(4000)) throw new IOException("4000 portunda beklenen OpenTerminal API yanıtı alınamadı. Hiçbir süreç kapatılmadı.");
                    if (!web && Listening(3000)) throw new IOException("3000 portunda beklenen OpenTerminal sayfası alınamadı. Hiçbir süreç kapatılmadı.");
                    if (!api) { progress("Veri servisi başlatılıyor…"); StartService("api"); WaitReady(() => ApiReady(ApiUrl), "API", 90); }
                    if (!web) { progress("Uygulama açılıyor. İlk açılış biraz sürebilir…"); StartService("web"); WaitReady(() => WebReady(WebUrl), "Web", 180); }
                    // Verify the browser proxy, not merely two independently listening services.
                    WaitReady(() => ApiReady(WebUrl + "api/status"), "Web/API bağlantısı", 30);
                    Log("READY api=4000 web=3000 reusedApi=" + api + " reusedWeb=" + web);
                    if (browser) { Process.Start(new ProcessStartInfo(WebUrl) { UseShellExecute = true }); Log("BROWSER opened"); }
                    return 0;
                } finally { if (acquired) gate.ReleaseMutex(); }
            }
        } catch (Exception error) {
            Log("ERROR " + error.Message);
            if (browser) MessageBox.Show(error.Message + "\n\nGünlükler: " + LogDir, "OpenTerminal açılamadı", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static void StartService(string name)
    {
        Process.Start(new ProcessStartInfo(Application.ExecutablePath, "--service " + name) {
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = InstallPaths.Root
        });
    }

    static void WaitReady(Func<bool> ready, string service, int seconds)
    {
        var timer = Stopwatch.StartNew();
        while (timer.Elapsed.TotalSeconds < seconds) { if (ready()) return; Thread.Sleep(500); }
        throw new TimeoutException(service + " hazır olmadı. data\\logs klasöründeki günlükleri kontrol edin.");
    }

    static int RunService(string name)
    {
        if (name != "api" && name != "web") return 2;
        try {
            using (var gate = new Mutex(false, @"Local\OpenTerminal.Desktop.Service." + name))
            {
                bool acquired;
                try { acquired = gate.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) return 0;
                try {
                    Directory.CreateDirectory(LogDir);
                    var info = new ProcessStartInfo(InstallPaths.Node,
                        name == "api" ? "node_modules/tsx/dist/cli.mjs src/index.ts" : "node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000") {
                        WorkingDirectory = Path.Combine(InstallPaths.Root, name == "api" ? "server" : "web"),
                        UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
                    };
                    // Fix local install endpoints and prevent an inherited outage-test preload.
                    info.EnvironmentVariables.Remove("NODE_OPTIONS");
                    info.EnvironmentVariables["API_PORT"] = "4000";
                    info.EnvironmentVariables["API_HOST"] = "127.0.0.1";
                    info.EnvironmentVariables["WEB_ORIGIN"] = "http://localhost:3000";
                    info.EnvironmentVariables["DATA_DIR"] = Path.Combine(InstallPaths.Root, "data");
                    info.EnvironmentVariables["API_KEY_FILE"] = Path.Combine(InstallPaths.Root, "data", ".api-key");
                    info.EnvironmentVariables["API_URL"] = "http://127.0.0.1:4000";
                    using (var output = new StreamWriter(Path.Combine(LogDir, name + ".launcher.log"), true) { AutoFlush = true })
                    using (var process = new Process { StartInfo = info }) {
                        object sync = new object();
                        DataReceivedEventHandler write = (sender, e) => { if (e.Data != null) lock (sync) output.WriteLine(DateTimeOffset.Now.ToString("o") + " " + e.Data); };
                        process.OutputDataReceived += write;
                        process.ErrorDataReceived += write;
                        process.Start();
                        process.BeginOutputReadLine();
                        process.BeginErrorReadLine();
                        Log("START " + name + " pid=" + process.Id);
                        process.WaitForExit();
                        Log("EXIT " + name + " code=" + process.ExitCode);
                        return process.ExitCode;
                    }
                } finally { gate.ReleaseMutex(); }
            }
        } catch (Exception error) { Log("SERVICE " + name + " ERROR " + error.Message); return 1; }
    }
}
