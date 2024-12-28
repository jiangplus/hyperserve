import { parseArgs } from "util";
import path from "path";

process.title = 'hyperserve';

const { values: state, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: 'string',
      default: '3000',
      description: 'Port to listen on',
    },
    baseDir: {
      type: 'string',
      default: '.',
      description: 'Base directory to serve files from',
    },
    showDir: {
      type: 'boolean',
      default: false,
      description: 'Show directory listing',
    },
    autoIndex: {
      type: 'boolean',
      default: true,
      description: 'Enable directory listing',
    },
    cors: {
      type: 'boolean',
      default: false,
      description: 'Enable CORS',
    },
    tls: {
      type: 'boolean',
      default: false,
      description: 'Enable TLS',
    },
    tlsCert: {
      type: 'string',
      default: '',
      description: 'TLS certificate file',
    },
    tlsKey: {
      type: 'string',
      default: '',
      description: 'TLS key file',
    },
    noDotfiles: {
      type: 'boolean',
      default: false,
      description: 'Do not serve dotfiles',
    },
    proxy: {
      type: 'string',
      default: '',
      description: 'Fallback proxy to the given URL',
    },
    username: {
      type: 'string',
      default: '',
      description: 'Username for basic auth',
    },
    password: {
      type: 'string',
      default: '',
      description: 'Password for basic auth',
    },
    logpath: {
      type: 'string',
      description: 'Log file path',
    },
    userAgent: {
      type: 'string',
      default: '',
      description: 'User agent to use for requests',
    },
    help: {
      type: 'boolean',
      default: false,
      description: 'Show help',
    },
    version: {
      type: 'boolean',
      default: false,
      description: 'Show version',
    },
  },
  strict: true,
  allowPositionals: true,
});

console.log(state);

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
    username: string;
    password: string;
    logpath: string;
    userAgent: string;

    constructor(options: typeof state) {
        this.port = options.port || '3000';
        this.baseDir = options.baseDir || '.';
        this.showDir = options.showDir || false;
        this.autoIndex = options.autoIndex || true;
        this.cors = options.cors || false;
        this.tls = options.tls || false;
        this.tlsCert = options.tlsCert || '';
        this.tlsKey = options.tlsKey || '';
        this.noDotfiles = options.noDotfiles || false;
        this.proxy = options.proxy || '';
        this.username = options.username || '';
        this.password = options.password || '';
        this.logpath = options.logpath || '';
        this.userAgent = options.userAgent || '';
    }

    async fetch(req: Request) {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const baseDir = this.baseDir;
        console.log(pathname);
        console.log(baseDir);
        const filePath = path.join(baseDir, pathname);
        let file;
        if (filePath.endsWith('/') && this.autoIndex) {
            file = Bun.file(path.join(filePath, 'index.html'));
        } else {
            file = Bun.file(filePath);
        }
        return new Response(file);
    }

    async start() {
        const server = Bun.serve({
            port: Number(this.port),
            fetch: this.fetch.bind(this),
        });
        console.log(`Listening on localhost:${server.port}`);
    }
}

const hyperserve = new Hyperserve(state);
hyperserve.start();
