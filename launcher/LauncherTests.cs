using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

internal static class LauncherTests
{
    static int Main()
    {
        int passed = 0;
        Check("valid OpenTerminal API", "{\"ok\":true,\"service\":\"OpenTerminal\"}", true, true); passed++;
        Check("unrelated service", "{\"ok\":true}", true, false); passed++;
        Check("failed API", "{\"ok\":false,\"service\":\"OpenTerminal\"}", true, false); passed++;
        Check("invalid JSON", "not json", true, false); passed++;
        Check("wrong ok type", "{\"ok\":\"true\",\"service\":\"OpenTerminal\"}", true, false); passed++;
        Check("valid application page", "<html><title>OpenTerminal</title></html>", false, true); passed++;
        Check("unrelated page mentioning app", "<title>Another app</title>OpenTerminal", false, false); passed++;
        var closed = new TcpListener(IPAddress.Loopback, 0);
        closed.Start(); int port = ((IPEndPoint)closed.LocalEndpoint).Port; closed.Stop();
        if (Launcher.Listening(port) || Launcher.ApiReady("http://127.0.0.1:" + port)) throw new Exception("closed port accepted");
        passed++;
        Console.WriteLine(passed + "/" + passed + " launcher checks passed");
        return 0;
    }

    static void Check(string name, string body, bool api, bool expected)
    {
        var server = new TcpListener(IPAddress.Loopback, 0);
        server.Start();
        int port = ((IPEndPoint)server.LocalEndpoint).Port;
        var reply = Task.Run(() => {
            using (var client = server.AcceptTcpClient())
            using (var stream = client.GetStream()) {
                stream.ReadTimeout = 5000;
                stream.Read(new byte[8192], 0, 8192);
                var content = Encoding.UTF8.GetBytes(body);
                var headers = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Length: " + content.Length + "\r\nConnection: close\r\n\r\n");
                stream.Write(headers, 0, headers.Length);
                stream.Write(content, 0, content.Length);
            }
        });
        try {
            string url = "http://127.0.0.1:" + port + "/";
            bool actual = api ? Launcher.ApiReady(url) : Launcher.WebReady(url);
            if (!reply.Wait(10000)) throw new Exception(name + " test server timed out");
            if (actual != expected) throw new Exception(name + " failed");
            Console.WriteLine("PASS " + name);
        } finally { server.Stop(); }
    }
}
