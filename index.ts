import { parseArgs } from "util";
import path from "path";
import { join, extname, relative, normalize } from "path";
import { statSync, readdirSync, readFileSync } from "fs";
import { ServerWebSocket, Server, type Serve } from "bun";

process.title = "hyperserve";

const { values: state, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      default: "3000",
      description: "Port to listen on",
    },
    baseDir: {
      type: "string",
      default: ".",
      description: "Base directory to serve files from",
    },
    showDir: {
      type: "boolean",
      default: false,
      description: "Show directory listing",
    },
    autoIndex: {
      type: "boolean",
      default: true,
      description: "Enable directory listing",
    },
    cors: {
      type: "boolean",
      default: false,
      description: "Enable CORS",
    },
    tls: {
      type: "boolean",
      default: false,
      description: "Enable TLS",
    },
    tlsCert: {
      type: "string",
      default: "",
      description: "TLS certificate file",
    },
    tlsKey: {
      type: "string",
      default: "",
      description: "TLS key file",
    },
    noDotfiles: {
      type: "boolean",
      default: false,
      description: "Do not serve dotfiles",
    },
    proxy: {
      type: "string",
      default: "",
      description: "Fallback proxy to the given URL",
    },
    wsproxy: {
      type: "string",
      default: "",
      description: "WebSocket proxy to the given URL",
    },
    username: {
      type: "string",
      default: "",
      description: "Username for basic auth",
    },
    password: {
      type: "string",
      default: "",
      description: "Password for basic auth",
    },
    logpath: {
      type: "string",
      description: "Log file path",
    },
    userAgent: {
      type: "string",
      default: "",
      description: "User agent to use for requests",
    },
    help: {
      type: "boolean",
      default: false,
      description: "Show help",
    },
    version: {
      type: "boolean",
      default: false,
      description: "Show version",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (state.help) {
  const help = `
    Usage: hyperserve [options]
    Options:
    --port <port>
    --baseDir <dir>
    --showDir
    --autoIndex
    --cors
    --tls
    --tlsCert <file>
    --tlsKey <file>
    --noDotfiles
    --proxy <url>
    --wsproxy <url>
    --username <username>
    --password <password>
    --userAgent <userAgent>
    --logpath <file>
    --help
    --version
    `;
  console.log(help);
  process.exit(0);
}

if (state.version) {
  console.log("0.1.0");
  process.exit(0);
}

interface WebSocketData {
  pathname: string;
  targetWs: WebSocket | null;
}

class Hyperserve {
  port: string;
  baseDir: string;
  showDir: boolean;
  autoIndex: boolean;
  cors: boolean;
  tls: boolean;
  tlsCert: string;
  tlsKey: string;
  noDotfiles: boolean;
  proxy: string;
  wsproxy: string;
  username: string;
  password: string;
  logpath: string;
  userAgent: string;
  theServer: Server;

  constructor(options: typeof state) {
    this.port =
      options.port || process.env.PORT || process.env.NODE_PORT || "3000";
    this.baseDir = options.baseDir || ".";
    this.showDir = options.showDir || false;
    this.autoIndex = options.autoIndex || true;
    this.cors = options.cors || false;
    this.tls = options.tls || false;
    this.tlsCert = options.tlsCert || "";
    this.tlsKey = options.tlsKey || "";
    this.noDotfiles = options.noDotfiles || false;
    this.proxy = options.proxy || "";
    this.wsproxy = options.wsproxy || "";
    this.username = options.username || "";
    this.password = options.password || "";
    this.logpath = options.logpath || "";
    this.userAgent = options.userAgent || "";
  }

  async fetch(req: Request): Promise<Response> {
    if (this.cors) {
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400', // 24 hours
          }
        });
      }
    }

    if (this.wsproxy && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const url = new URL(req.url);
      const upgraded = this.theServer.upgrade(req, {
        data: { pathname: url.pathname },
      });
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      return new Response(null, { status: 101 });
    }

    if (this.username && this.password) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !this.isValidBasicAuth(authHeader)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="Authentication required"',
          },
        });
      }
    }

    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);
    const baseDir = this.baseDir;
    let filePath = normalize(path.join(baseDir, pathname));

    try {
      let stat = statSync(filePath);

      if (stat.isDirectory()) {
        if (this.showDir) {
          let response = await this.serveDirectoryIndex(filePath, pathname);
          return this.addCorsHeaders(response);
        } else if (this.autoIndex) {
          filePath = path.join(filePath, "index.html");
          if (statSync(filePath).isFile()) {
            return this.addCorsHeaders(new Response(Bun.file(filePath)));
          } else if (this.proxy) {
            return this.addCorsHeaders(await this.handleProxy(req, this.proxy));
          } else {
            return this.addCorsHeaders(new Response("index.html not found", { status: 404 }));
          }
        } else {
          return this.addCorsHeaders(new Response("Directory listing not allowed", { status: 403 }));
        }
      }

      if (stat.isFile()) {
        const file = Bun.file(filePath);
        const mimeType = file.type || "application/octet-stream";
        return this.addCorsHeaders(new Response(file, {
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(stat.size),
            "Last-Modified": stat.mtime.toUTCString(),
          },
        }));
      }

      // If we get here, try proxy if enabled
      if (this.proxy) {
        return this.addCorsHeaders(await this.handleProxy(req, this.proxy));
      }

      return this.addCorsHeaders(new Response("Not Found", { status: 404 }));
    } catch (err) {
      // File not found or access denied, try proxy if enabled
      if (this.proxy) {
        try {
          return this.addCorsHeaders(await this.handleProxy(req, this.proxy));
        } catch (proxyErr) {
          console.error("Proxy request failed:", proxyErr);
          return this.addCorsHeaders(new Response("Not Found", { status: 404 }));
        }
      }
      return this.addCorsHeaders(new Response("Not Found", { status: 404 }));
    }
  }

  async handleProxy(req: Request, target: string): Promise<Response> {
    const url = new URL(req.url);
    const targetUrl = new URL(target);

    // Combine target pathname with request pathname
    const proxyPathname = join(targetUrl.pathname, url.pathname);
    targetUrl.pathname = proxyPathname;
    targetUrl.search = url.search;

    // Create new headers object to modify the host and user agent
    const headers = new Headers(req.headers);
    headers.set("host", targetUrl.host);

    // Set X-Forwarded-For header
    const clientIP =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    headers.set("x-forwarded-for", clientIP);

    // Set User-Agent if specified, or copy from original request if it's a curl request
    if (this.userAgent) {
      headers.set("user-agent", this.userAgent);
    }

    const proxyReq = new Request(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    try {
      const response = await fetch(proxyReq);
      return response;
    } catch (err) {
      return new Response("Proxy Error", { status: 502 });
    }
  }

  async serveDirectoryIndex(
    dirPath: string,
    urlPath: string,
  ): Promise<Response> {
    try {
      const files = readdirSync(dirPath);
      const items = files
        // Filter out dotfiles if noDotfiles option is set
        .filter((file) => !this.noDotfiles || !file.startsWith("."))
        .map((file) => {
          const fullPath = join(dirPath, file);
          const stat = statSync(fullPath);
          const isDir = stat.isDirectory();
          const size = stat.size;
          const mtime = stat.mtime;

          return {
            name: file,
            isDirectory: isDir,
            size,
            mtime,
          };
        });

      // Generate HTML for directory listing
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Index of ${urlPath}</title>
            <style>
              body { font-family: system-ui; padding: 2em; }
              table { width: 100%; border-collapse: collapse; }
              th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
              a { text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>Index of ${urlPath}</h1>
            <table>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Last Modified</th>
              </tr>
              ${items
                .map(
                  (item) => `
                <tr>
                  <td>
                    <a href="${join(urlPath, item.name)}${item.isDirectory ? "/" : ""}">
                      ${item.name}${item.isDirectory ? "/" : ""}
                    </a>
                  </td>
                  <td>${item.isDirectory ? "-" : formatSize(item.size)}</td>
                  <td>${item.mtime.toUTCString()}</td>
                </tr>
              `,
                )
                .join("")}
            </table>
          </body>
        </html>
      `;

      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    } catch (err) {
      return new Response("Error reading directory", { status: 500 });
    }
  }

  async start() {
    let hserver = this;

    // Add TLS configuration if enabled
    const serverOptions: Serve = {
      port: Number(this.port),
      fetch: this.fetch.bind(this),
    };

    if (this.tls) {
      if (!this.tlsCert || !this.tlsKey) {
        throw new Error("TLS enabled but certificate or key file not provided");
      }

      try {
        serverOptions.tls = {
          cert: readFileSync(this.tlsCert),
          key: readFileSync(this.tlsKey),
        };
      } catch (err) {
        throw new Error(
          `Failed to read TLS certificate or key: ${err.message}`,
        );
      }
    }

    // Add websocket configuration if enabled
    if (this.wsproxy) {
      serverOptions.websocket = {
        message(ws: ServerWebSocket<WebSocketData>, message) {
          ws.data.targetWs?.send(message);
        },
        open(ws: ServerWebSocket<WebSocketData>) {
          try {
            // Create WebSocket connection to target
            const targetWs = new WebSocket(hserver.wsproxy + ws.data.pathname);
            ws.data.targetWs = targetWs;

            // Forward target messages back to client
            targetWs.addEventListener("message", (event) => {
              ws.send(event.data);
            });

            // Handle target connection close
            targetWs.addEventListener("close", () => {
              ws.close();
            });
          } catch (err) {
            console.error("WebSocket proxy connection failed:", err);
            ws.close();
          }
        },
        close(ws: ServerWebSocket<WebSocketData>) {
          ws.data.targetWs?.close();
        },
        data: {
          pathname: "",
          targetWs: null,
        },
      };
    }

    this.theServer = Bun.serve(serverOptions);

    if (this.wsproxy) {
      console.log(`WebSocket proxy enabled to ${hserver.wsproxy}`);
    }
    console.log(
      `Listening on ${this.tls ? "https" : "http"}://localhost:${hserver.theServer.port}`,
    );
  }

  private isValidBasicAuth(authHeader: string): boolean {
    const base64Credentials = authHeader.split(" ")[1] || "";
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(":");

    return username === this.username && password === this.password;
  }

  private addCorsHeaders(response: Response): Response {
    if (!this.cors) return response;

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}

// Utility function to format file sizes
function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

const hyperserve = new Hyperserve(state);
hyperserve.start();
